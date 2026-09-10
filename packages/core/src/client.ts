export type Visibility = "public" | "private";

export type Interaction = "upvote" | "downvote" | "plus_one" | "like";

export type KindInteractions = Partial<Record<Interaction, boolean>>;

export type ShowCounts = Partial<Record<FeatureKind, boolean>>;

export type GroupMode = "tabs" | "list";

export type Theme = {
  primary?: string;
  primaryDark?: string;
  radius?: number;
  /// `"system"` follows the OS color scheme at render time.
  mode?: "light" | "dark" | "system";
  font_family?: string;
  font_size?: "sm" | "md" | "lg";
  group_mode?: GroupMode;
  show_counts?: ShowCounts;
  // Older deployments may still send camelCase keys for these — kept for backcompat.
  fontFamily?: string;
};

export type EndUser = {
  externalId?: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  platform?: string;
  /// HMAC_SHA256(serverSecret, externalId) as lowercase hex, computed on YOUR backend.
  /// Required whenever `externalId` is set — the API rejects unsigned ids with
  /// 401 invalid_user_signature. Never compute this in the browser.
  userHash?: string;
};

export type FeatureKind =
  | "feature_request"
  | "bug_report"
  | "improvement"
  | "appreciation"
  | "other";

export type Feature = {
  id: string;
  title: string;
  description: string;
  status: "open" | "planned" | "in_progress" | "shipped" | "declined";
  kind: FeatureKind;
  /// Whether the item is visible beyond its author + the workspace team.
  visibility: Visibility;
  /// Whether the item appears on the workspace's roadmap (public if visibility=public).
  on_roadmap: boolean;
  tag: string | null;
  vote_count: number;
  voted: boolean;
  platform: string | null;
  author_name: string | null;
  created_at: string;
};

export type Comment = {
  id: string;
  body: string;
  author_name: string | null;
  is_internal: boolean;
  created_at: string;
};

export type HeedKitConfig = {
  workspaceKey: string;
  apiUrl?: string;
  user?: EndUser;
  /** Optional persistence for native runtimes; defaults to browser localStorage. */
  storage?: IdentityStorage;
};

/// Workspace configuration returned by /sdk/init (nested under `workspace`).
export type WorkspaceConfig = {
  name: string;
  theme: Theme;
  enabled_kinds: FeatureKind[];
  /// Default visibility applied to new submissions of each kind.
  kind_visibility: Record<FeatureKind, Visibility>;
  /// Which interactions admin has enabled per kind. The widget should only render
  /// the affordances listed here.
  kind_interactions: Record<FeatureKind, KindInteractions>;
  is_public_roadmap?: boolean;
  branding?: Branding;
};

export type InitResult = {
  end_user_id: string;
  /// Signed replay token; sent as X-HeedKit-Identity on every later call. Optional so
  /// responses from older deployments still parse.
  identity?: string;
  workspace: WorkspaceConfig;
};

export type Branding = {
  show_powered_by: boolean;
  label?: string;
  url?: string;
};

export type IdentityStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

export type FeatureListOptions = {
  status?: string;
  kind?: FeatureKind;
  sort?: "top" | "new";
  cursor?: string;
};

export type FeaturePage = { features: Feature[]; next_cursor: string | null };

const DEFAULT_API = "https://heedkit.com";

// Only anonymous tokens are persisted. A new namespace intentionally drops old
// caches which could contain a named token after logout. Include the API origin
// so development and production identities cannot overwrite each other.
const identityStorageKey = (apiUrl: string, workspaceKey: string) =>
  `heedkit.anonymous.v1.${apiUrl}.${workspaceKey}`;

function browserStorage(): IdentityStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function normalizeTheme(theme: Theme): Theme {
  if (theme.radius === undefined) return { ...theme };
  // Rails has historically returned CSS lengths. Native consumers need pixels.
  const value: unknown = theme.radius;
  const length = typeof value === "string" && value.trim().match(/^(\d*\.?\d+)(px|rem|em)$/);
  const radius = typeof value === "number" ? value : length ? Number(length[1]) * (length[2] === "px" ? 1 : 16) : 12;
  return { ...theme, radius: Number.isFinite(radius) ? Math.max(0, radius) : 12 };
}

/// Map a raw API feature onto the SDK shape (the backend compacts null fields and
/// exposes the author display name as `author`).
function normalizeFeature(f: any): Feature {
  return {
    id: String(f.id),
    title: f.title,
    description: f.description ?? "",
    status: f.status,
    kind: f.kind,
    visibility: f.visibility,
    on_roadmap: f.on_roadmap ?? false,
    tag: f.tag ?? null,
    vote_count: f.vote_count ?? 0,
    voted: f.voted ?? false,
    platform: f.platform ?? null,
    author_name: f.author_name ?? f.author ?? null,
    created_at: f.created_at,
  };
}

function normalizeComment(c: any): Comment {
  return {
    id: String(c.id),
    body: c.body,
    author_name: c.author_name ?? c.author ?? null,
    // The SDK endpoint only ever returns public comments.
    is_internal: c.is_internal ?? false,
    created_at: c.created_at,
  };
}

export class HeedKitClient {
  private readonly apiUrl: string;
  private readonly workspaceKey: string;
  private readonly storage: IdentityStorage | undefined;
  private readonly storageKey: string;
  private generation = 0;
  private abort = new AbortController();
  private user: EndUser | null = null;
  private identity: string | null = null;
  private endUserId: string | null = null;
  private config: WorkspaceConfig | null = null;
  private refresh: Promise<void> | null = null;

  constructor(config: HeedKitConfig) {
    this.apiUrl = (config.apiUrl || DEFAULT_API).replace(/\/+$/, "");
    this.workspaceKey = config.workspaceKey;
    this.storage = config.storage || browserStorage();
    this.storageKey = identityStorageKey(this.apiUrl, this.workspaceKey);
  }

  /** Identify the current session. Calling again replaces it immediately. */
  async init(user: EndUser = {}): Promise<InitResult> {
    const previousAnonymous = this.user && !this.user.externalId ? this.identity : null;
    this.clearSession();
    const generation = this.generation;
    this.user = { ...user };
    try {
      // Named sessions never consume or populate the anonymous identity cache.
      if (user.externalId) await this.forgetStoredIdentity();
      else this.identity = previousAnonymous || await this.loadStoredIdentity();
      this.assertCurrent(generation);
      return await this.initialize(generation);
    } catch (error) {
      if (generation === this.generation) this.clearSession();
      throw error;
    }
  }

  /** Forget the current identity, cancel outstanding work, and clear its cache. */
  async reset(): Promise<void> {
    this.clearSession();
    await this.forgetStoredIdentity();
  }

  private clearSession() {
    this.abort.abort();
    this.abort = new AbortController();
    this.generation += 1;
    this.user = null;
    this.identity = null;
    this.endUserId = null;
    this.config = null;
    this.refresh = null;
  }

  private assertCurrent(generation: number) {
    if (generation !== this.generation) throw new Error("HeedKit session changed");
  }

  private async loadStoredIdentity(): Promise<string | null> {
    try { return await this.storage?.getItem(this.storageKey) || null; }
    catch { return null; }
  }

  private async forgetStoredIdentity() {
    try { await this.storage?.removeItem(this.storageKey); }
    catch { /* Privacy mode and unavailable native storage are normal. */ }
  }

  private async initialize(generation: number): Promise<InitResult> {
    const user = this.user!;
    const body: Record<string, unknown> = {
      email: user.email, name: user.name, avatar_url: user.avatarUrl,
      platform: user.platform || "web",
    };
    if (user.externalId) {
      body.external_id = user.externalId;
      body.user_hash = user.userHash;
    }
    // /init accepts an expired token and reauthenticates from the signed identity.
    // Anonymous init always goes live so workspace configuration also refreshes.
    const result = await this.request<InitResult>("/sdk/init", "POST", body, generation, true);
    this.assertCurrent(generation);
    this.identity = result.identity ?? null;
    this.endUserId = String(result.end_user_id);
    this.config = { ...result.workspace, theme: normalizeTheme(result.workspace.theme || {}) };
    if (!user.externalId && result.identity) {
      try { await this.storage?.setItem(this.storageKey, result.identity); }
      catch { /* Anonymous continuity is best effort. */ }
      this.assertCurrent(generation);
    }
    return { ...result, workspace: this.config };
  }

  getTheme(): Theme { return this.config?.theme || {}; }
  getEnabledKinds(): FeatureKind[] { return this.config?.enabled_kinds || []; }
  getKindVisibility(): Partial<Record<FeatureKind, Visibility>> { return this.config?.kind_visibility || {}; }
  getKindInteractions(): Partial<Record<FeatureKind, KindInteractions>> { return this.config?.kind_interactions || {}; }
  getWorkspaceName() { return this.config?.name || ""; }
  getEndUserId() { return this.endUserId; }
  getBranding(): Branding {
    return this.config?.branding || { show_powered_by: true, label: "Powered by HeedKit", url: "https://heedkit.com/?ref=widget" };
  }

  /** Supported positive-vote affordances. Downvotes require a different API. */
  getInteractionsFor(kind: FeatureKind): Interaction[] {
    const row = this.getKindInteractions()[kind] || {};
    return (["upvote", "plus_one", "like"] as Interaction[]).filter((interaction) => row[interaction]);
  }

  /** Fetch one page for incremental UIs. Pass next_cursor to retrieve another. */
  async listPage(opts: FeatureListOptions = {}): Promise<FeaturePage> {
    this.ensureInit();
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.kind) params.set("kind", opts.kind);
    if (opts.sort) params.set("sort", opts.sort);
    if (opts.cursor) params.set("cursor", opts.cursor);
    const result = await this.request<any>(`/sdk/features?${params}`, "GET");
    return {
      features: (Array.isArray(result) ? result : result.features ?? []).map(normalizeFeature),
      next_cursor: Array.isArray(result) ? null : result.next_cursor ?? null,
    };
  }

  /** List all matching features; existing callers keep receiving an array. */
  async list(opts: FeatureListOptions = {}): Promise<Feature[]> {
    const generation = this.generation;
    const features = new Map<string, Feature>();
    const seen = new Set<string>();
    let cursor = opts.cursor;
    do {
      if (cursor && seen.has(cursor)) throw new Error("HeedKit returned a repeated pagination cursor");
      if (cursor) seen.add(cursor);
      const page = await this.listPage({ ...opts, cursor });
      this.assertCurrent(generation);
      for (const feature of page.features) features.set(feature.id, feature);
      cursor = page.next_cursor || undefined;
    } while (cursor);
    return [...features.values()];
  }

  async submit(input: { title: string; description?: string; tag?: string; kind?: FeatureKind }): Promise<Feature> {
    this.ensureInit();
    const result = await this.request<any>("/sdk/features", "POST", {
      title: input.title, description: input.description || "",
      tag: input.tag || null, kind: input.kind || "feature_request",
    });
    return normalizeFeature(result);
  }

  async vote(featureId: string): Promise<{ voted: boolean; vote_count: number }> {
    this.ensureInit();
    return this.request(`/sdk/features/${encodeURIComponent(featureId)}/vote`, "POST", {});
  }

  async listComments(featureId: string): Promise<Comment[]> {
    this.ensureInit();
    const result = await this.request<any>(`/sdk/features/${encodeURIComponent(featureId)}/comments`, "GET");
    return (Array.isArray(result) ? result : result.comments ?? []).map(normalizeComment);
  }

  async comment(featureId: string, body: string): Promise<Comment> {
    this.ensureInit();
    const result = await this.request<any>(`/sdk/features/${encodeURIComponent(featureId)}/comments`, "POST", { body });
    return normalizeComment(result);
  }

  private ensureInit() {
    if (!this.endUserId) throw new Error("HeedKit not initialized — call init() first");
  }

  private async request<T>(path: string, method: string, body?: unknown, generation = this.generation, retried = false): Promise<T> {
    this.assertCurrent(generation);
    const token = this.identity;
    const headers: Record<string, string> = {
      "Content-Type": "application/json", "X-Workspace-Key": this.workspaceKey,
    };
    if (token) headers["X-HeedKit-Identity"] = token;
    const response = await fetch(`${this.apiUrl}${path}`, {
      method, headers, signal: this.abort.signal,
      body: body ? JSON.stringify(body) : undefined,
    });
    this.assertCurrent(generation);
    const data = await response.json().catch(() => null);
    this.assertCurrent(generation);
    if (!response.ok) {
      const detail = data?.error || data?.detail || `HTTP ${response.status}`;
      const invalidIdentity = response.status === 401 && detail === "invalid_identity";
      if (invalidIdentity && !retried && path !== "/sdk/init" && this.user) {
        // Share reauthentication between concurrent expired-token requests. A late
        // response for an old token can reuse a refresh that already completed.
        if (this.identity === token) {
          if (!this.refresh) {
            this.refresh = this.initialize(generation).then(() => undefined).catch(async (error) => {
              if (generation === this.generation) {
                this.clearSession();
                await this.forgetStoredIdentity();
              }
              throw error;
            });
          }
          const pending = this.refresh;
          try { await pending; }
          finally { if (this.refresh === pending) this.refresh = null; }
        }
        this.assertCurrent(generation);
        return this.request(path, method, body, generation, true);
      }
      if (response.status === 401 && path !== "/sdk/init") {
        this.clearSession();
        await this.forgetStoredIdentity();
      }
      throw new Error(detail);
    }
    return data as T;
  }
}
