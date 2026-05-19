export type Theme = {
  primary?: string;
  primaryDark?: string;
  radius?: number;
  mode?: "light" | "dark";
  fontFamily?: string;
};

export type EndUser = {
  externalId?: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  platform?: string;
};

export type Feature = {
  id: string;
  title: string;
  description: string;
  status: "open" | "planned" | "in_progress" | "shipped" | "declined";
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
  end_user_id: string;
};

const DEFAULT_API = "https://api.feedbackhub.dev";

export class FeedbackHubClient {
  private apiUrl: string;
  private projectKey: string;
  private endUserId: string | null = null;
  private theme: Theme = {};
  private projectName = "";

  constructor(config: FeedbackHubConfig) {
    this.apiUrl = config.apiUrl || DEFAULT_API;
    this.projectKey = config.projectKey;
  }

  async init(user: EndUser = {}): Promise<InitResult> {
    const body = {
      external_id: user.externalId,
      email: user.email,
      name: user.name,
      avatar_url: user.avatarUrl,
      platform: user.platform || "web",
    };
    const res = await this.request<InitResult>("/sdk/init", "POST", body);
    this.endUserId = res.end_user_id;
    this.theme = res.theme || {};
    this.projectName = res.project_name;
    return res;
  }

  getTheme() { return this.theme; }
  getProjectName() { return this.projectName; }
  getEndUserId() { return this.endUserId; }

  async list(opts: { status?: string; sort?: "top" | "new" } = {}): Promise<Feature[]> {
    this.ensureInit();
    const params = new URLSearchParams({ end_user_id: this.endUserId! });
    if (opts.status) params.set("status", opts.status);
    if (opts.sort) params.set("sort", opts.sort);
    return this.request<Feature[]>(`/sdk/features?${params}`, "GET");
  }

  async submit(input: { title: string; description?: string; tag?: string }): Promise<Feature> {
    this.ensureInit();
    return this.request<Feature>("/sdk/features", "POST", {
      end_user_id: this.endUserId,
      title: input.title,
      description: input.description || "",
      tag: input.tag || null,
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
