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
};

export type InitResult = {
  end_user_id: string;
  /// Signed replay token; sent as X-HeedKit-Identity on every later call. Optional so
  /// responses from older deployments still parse.
  identity?: string;
  workspace: WorkspaceConfig;
};

const DEFAULT_API = "https://api.heedkit.com";

// ---------------------------------------------------------------------------
// Anonymous identity persistence. The API only binds a NAMED identity when the
// backend signs it (user_hash), so anonymous continuity works by persisting the
// server-issued identity token (not by inventing a device external_id — the API
// rejects any unsigned external_id). Scoped per workspaceKey; best-effort only:
// privacy mode / SSR simply yields a fresh anonymous user per init.
// ---------------------------------------------------------------------------

type StoredIdentity = { identity: string; init: InitResult };

const identityStorageKey = (workspaceKey: string) => `heedkit.identity.${workspaceKey}`;

function loadStoredIdentity(workspaceKey: string): StoredIdentity | null {
  try {
    const raw = globalThis.localStorage?.getItem(identityStorageKey(workspaceKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredIdentity;
    return parsed?.identity && parsed?.init?.end_user_id ? parsed : null;
  } catch {
    return null;
  }
}

function saveStoredIdentity(workspaceKey: string, blob: StoredIdentity): void {
  try {
    globalThis.localStorage?.setItem(identityStorageKey(workspaceKey), JSON.stringify(blob));
  } catch { /* privacy mode / SSR — continuity degrades gracefully */ }
}

function clearStoredIdentity(workspaceKey: string): void {
  try {
    globalThis.localStorage?.removeItem(identityStorageKey(workspaceKey));
  } catch { /* ignore */ }
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
  private apiUrl: string;
  private workspaceKey: string;
  private endUserId: string | null = null;
  private identity: string | null = null;
  /// True when `identity` came from localStorage rather than a live init — those can
  /// be stale, so the first 401 triggers one fresh anonymous re-init + retry.
  private identityRestored = false;
  private theme: Theme = {};
  private workspaceName = "";
  private enabledKinds: FeatureKind[] = [];
  private kindVisibility: Partial<Record<FeatureKind, Visibility>> = {};
  private kindInteractions: Partial<Record<FeatureKind, KindInteractions>> = {};

  constructor(config: HeedKitConfig) {
    this.apiUrl = config.apiUrl || DEFAULT_API;
    this.workspaceKey = config.workspaceKey;
  }

  async init(user: EndUser = {}): Promise<InitResult> {
    if (!user.externalId) {
      // Anonymous: reuse the persisted server-issued identity when we have one, so
      // votes/submissions stick to the same EndUser across page loads.
      const stored = loadStoredIdentity(this.workspaceKey);
      if (stored?.init?.workspace) {
        this.identity = stored.identity;
        this.identityRestored = true;
        this.hydrate(stored.init);
        return stored.init;
      }
      // A pre-0.4 cached payload lacks `workspace`. Preserve its identity token, fetch
      // the Workspace-shaped config live, and replace the cache entry.
      if (stored) {
        this.identity = stored.identity;
        this.identityRestored = true;
        const res = await this.initRequest(user);
        if (res.identity) saveStoredIdentity(this.workspaceKey, { identity: res.identity, init: res });
        return res;
      }
      const res = await this.initRequest(user); // no external_id sent
      if (res.identity) saveStoredIdentity(this.workspaceKey, { identity: res.identity, init: res });
      return res;
    }

    // Identified: always hit the API (profile sync); a named identity supersedes
    // any persisted anonymous one.
    clearStoredIdentity(this.workspaceKey);
    return this.initRequest(user);
  }

  private async initRequest(user: EndUser): Promise<InitResult> {
    const body: Record<string, unknown> = {
      email: user.email,
      name: user.name,
      avatar_url: user.avatarUrl,
      platform: user.platform || "web",
    };
    if (user.externalId) {
      // The API rejects an unsigned external_id (401 invalid_user_signature), so the
      // id and its backend-computed HMAC travel together.
      body.external_id = user.externalId;
      body.user_hash = user.userHash;
    }
    const res = await this.request<InitResult>("/sdk/init", "POST", body);
    this.identity = res.identity ?? null;
    this.identityRestored = false;
    this.hydrate(res);
    return res;
  }

  private hydrate(res: InitResult) {
    this.endUserId = res.end_user_id;
    const workspace = res.workspace;
    this.theme = workspace.theme || {};
    this.workspaceName = workspace.name || "";
    this.enabledKinds = workspace.enabled_kinds || [];
    this.kindVisibility = workspace.kind_visibility || {};
    this.kindInteractions = workspace.kind_interactions || {};
  }

  getTheme() { return this.theme; }
  getEnabledKinds(): FeatureKind[] { return this.enabledKinds; }
  getKindVisibility() { return this.kindVisibility; }
  getKindInteractions() { return this.kindInteractions; }
  getWorkspaceName() { return this.workspaceName; }
  getEndUserId() { return this.endUserId; }

  /// Convenience: which interactions are enabled for a given kind, in stable order.
  getInteractionsFor(kind: FeatureKind): Interaction[] {
    const row = this.kindInteractions[kind] || {};
    return (["upvote", "downvote", "plus_one", "like"] as Interaction[]).filter(
      (i) => row[i]
    );
  }

  async list(
    opts: { status?: string; kind?: FeatureKind; sort?: "top" | "new" } = {}
  ): Promise<Feature[]> {
    this.ensureInit();
    // The caller is identified by the X-HeedKit-Identity header, not a param.
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.kind) params.set("kind", opts.kind);
    if (opts.sort) params.set("sort", opts.sort);
    // Rails returns { features, next_cursor }; tolerate a bare array too.
    const res = await this.request<any>(`/sdk/features?${params}`, "GET");
    const features = Array.isArray(res) ? res : (res.features ?? []);
    return features.map((f: any) => normalizeFeature(f));
  }

  async submit(input: {
    title: string;
    description?: string;
    tag?: string;
    kind?: FeatureKind;
  }): Promise<Feature> {
    this.ensureInit();
    const res = await this.request<any>("/sdk/features", "POST", {
      title: input.title,
      description: input.description || "",
      tag: input.tag || null,
      kind: input.kind || "feature_request",
    });
    return normalizeFeature(res);
  }

  async vote(featureId: string): Promise<{ voted: boolean; vote_count: number }> {
    this.ensureInit();
    return this.request(`/sdk/features/${featureId}/vote`, "POST", {});
  }

  async listComments(featureId: string): Promise<Comment[]> {
    const res = await this.request<any>(`/sdk/features/${featureId}/comments`, "GET");
    const comments = Array.isArray(res) ? res : (res.comments ?? []);
    return comments.map((c: any) => normalizeComment(c));
  }

  async comment(featureId: string, body: string): Promise<Comment> {
    this.ensureInit();
    const res = await this.request<any>(`/sdk/features/${featureId}/comments`, "POST", { body });
    return normalizeComment(res);
  }

  private ensureInit() {
    if (!this.endUserId) throw new Error("HeedKit not initialized — call init() first");
  }

  private async request<T>(path: string, method: string, body?: unknown, retried = false): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Workspace-Key": this.workspaceKey,
    };
    if (this.identity) headers["X-HeedKit-Identity"] = this.identity;
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      // A persisted anonymous identity can go stale. Recover once: drop it, mint a
      // fresh anonymous identity, and replay the call. Never applies to /sdk/init
      // itself or to live (non-restored) identities.
      if (res.status === 401 && this.identityRestored && !retried && path !== "/sdk/init") {
        clearStoredIdentity(this.workspaceKey);
        this.identity = null;
        this.identityRestored = false;
        await this.init({});
        return this.request(path, method, body, true);
      }
      let detail = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        detail = j.error || j.detail || detail; // Rails uses `error`; legacy used `detail`.
      } catch { /* non-JSON body */ }
      throw new Error(detail);
    }
    return res.json() as Promise<T>;
  }
}
