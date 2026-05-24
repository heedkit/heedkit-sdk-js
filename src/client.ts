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
  /// Whether the item is visible beyond its author + the project team.
  visibility: Visibility;
  /// Whether the item appears on the project's roadmap (public if visibility=public).
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

export type FeedbackHubConfig = {
  projectKey: string;
  apiUrl?: string;
  user?: EndUser;
};

export type InitResult = {
  project_id: string;
  project_name: string;
  theme: Theme;
  enabled_kinds: FeatureKind[];
  /// Default visibility applied to new submissions of each kind.
  kind_visibility: Record<FeatureKind, Visibility>;
  /// Which interactions admin has enabled per kind. The widget should only render
  /// the affordances listed here.
  kind_interactions: Record<FeatureKind, KindInteractions>;
  end_user_id: string;
};

const DEFAULT_API = "https://api.feedbackhub.dev";
const DEVICE_ID_KEY = "feedbackhub.device_id";

/**
 * Stable per-browser identifier persisted in localStorage. When the customer
 * doesn't pass `externalId`, we still want votes/submissions to stick to the
 * same EndUser across page loads — otherwise every refresh would create a new
 * anonymous account.
 *
 * Returns null on the server (SSR), so callers should fall back to a fresh id.
 */
export function getOrCreateDeviceId(): string | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const next = "dev_" + (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
    window.localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    // Privacy mode / disabled storage — caller falls back to anonymous.
    return null;
  }
}

export class FeedbackHubClient {
  private apiUrl: string;
  private projectKey: string;
  private endUserId: string | null = null;
  private theme: Theme = {};
  private projectName = "";
  private enabledKinds: FeatureKind[] = [];
  private kindVisibility: Partial<Record<FeatureKind, Visibility>> = {};
  private kindInteractions: Partial<Record<FeatureKind, KindInteractions>> = {};

  constructor(config: FeedbackHubConfig) {
    this.apiUrl = config.apiUrl || DEFAULT_API;
    this.projectKey = config.projectKey;
  }

  async init(user: EndUser = {}): Promise<InitResult> {
    // If the caller didn't pass an external_id, fall back to a stable
    // per-browser device id so refreshes keep the same EndUser.
    const externalId = user.externalId ?? getOrCreateDeviceId() ?? undefined;
    const body = {
      external_id: externalId,
      email: user.email,
      name: user.name,
      avatar_url: user.avatarUrl,
      platform: user.platform || "web",
    };
    const res = await this.request<InitResult>("/sdk/init", "POST", body);
    this.endUserId = res.end_user_id;
    this.theme = res.theme || {};
    this.projectName = res.project_name;
    this.enabledKinds = res.enabled_kinds || [];
    this.kindVisibility = res.kind_visibility || {};
    this.kindInteractions = res.kind_interactions || {};
    return res;
  }

  getTheme() { return this.theme; }
  getEnabledKinds(): FeatureKind[] { return this.enabledKinds; }
  getKindVisibility() { return this.kindVisibility; }
  getKindInteractions() { return this.kindInteractions; }
  getProjectName() { return this.projectName; }
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
    const params = new URLSearchParams({ end_user_id: this.endUserId! });
    if (opts.status) params.set("status", opts.status);
    if (opts.kind) params.set("kind", opts.kind);
    if (opts.sort) params.set("sort", opts.sort);
    return this.request<Feature[]>(`/sdk/features?${params}`, "GET");
  }

  async submit(input: {
    title: string;
    description?: string;
    tag?: string;
    kind?: FeatureKind;
  }): Promise<Feature> {
    this.ensureInit();
    return this.request<Feature>("/sdk/features", "POST", {
      end_user_id: this.endUserId,
      title: input.title,
      description: input.description || "",
      tag: input.tag || null,
      kind: input.kind || "feature_request",
    });
  }

  async vote(featureId: string): Promise<{ voted: boolean; vote_count: number }> {
    this.ensureInit();
    return this.request(`/sdk/features/${featureId}/vote`, "POST", {
      end_user_id: this.endUserId,
    });
  }

  async listComments(featureId: string): Promise<Comment[]> {
    return this.request<Comment[]>(`/sdk/features/${featureId}/comments`, "GET");
  }

  async comment(featureId: string, body: string): Promise<Comment> {
    this.ensureInit();
    return this.request<Comment>(`/sdk/features/${featureId}/comments`, "POST", {
      end_user_id: this.endUserId,
      body,
    });
  }

  private ensureInit() {
    if (!this.endUserId) throw new Error("FeedbackHub not initialized — call init() first");
  }

  private async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Project-Key": this.projectKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { detail = (await res.json()).detail || detail; } catch {}
      throw new Error(detail);
    }
    return res.json() as Promise<T>;
  }
}
