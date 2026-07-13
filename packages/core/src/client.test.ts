import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HeedKitClient, type InitResult } from "./client";

// ---------------------------------------------------------------------------
// fetch mocking helpers
// ---------------------------------------------------------------------------

type FetchCall = { url: string; init?: RequestInit };

function mockFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return handler(call);
  });
  // @ts-expect-error — overriding global fetch for the test
  globalThis.fetch = fetchMock;
  return { calls, fetchMock };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// The Rails /sdk/init response nests project config under `project`.
const FULL_INIT_RESPONSE: InitResult = {
  end_user_id: "eu-alice",
  identity: "idtok-1",
  project: {
    name: "Test",
    theme: { primary: "#000000" },
    enabled_kinds: ["feature_request", "bug_report", "improvement", "appreciation", "other"],
    kind_visibility: {
      feature_request: "public",
      bug_report: "private",
      improvement: "private",
      appreciation: "private",
      other: "private",
    },
    kind_interactions: {
      feature_request: { upvote: true, downvote: false },
      bug_report: { plus_one: true },
      improvement: { upvote: true, downvote: false },
      appreciation: { like: true },
      other: { like: true },
    },
    is_public_roadmap: false,
  },
};

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as any).localStorage; // tests run in node; stubs are per-test
  vi.restoreAllMocks();
});

// Minimal localStorage stand-in for the anonymous-identity persistence tests
// (vitest runs in node, where no localStorage exists).
function stubLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  return store;
}

// ---------------------------------------------------------------------------
// init() — payload parsing + state hydration
// ---------------------------------------------------------------------------

describe("HeedKitClient.init", () => {
  it("posts identity to /sdk/init with the project key header", async () => {
    const { calls } = mockFetch(() => jsonResponse(FULL_INIT_RESPONSE));
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });

    await client.init({ externalId: "alice", email: "alice@x.com", platform: "tests" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://api/sdk/init");
    const init = calls[0].init!;
    expect(init.method).toBe("POST");
    // init.headers may be a Headers instance OR a plain object depending on the runtime.
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("X-Project-Key")).toBe("fh_test");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      external_id: "alice",
      email: "alice@x.com",
      name: undefined,
      avatar_url: undefined,
      platform: "tests",
    });
  });

  it("defaults platform to 'web' when no user is provided", async () => {
    const { calls } = mockFetch(() => jsonResponse(FULL_INIT_RESPONSE));
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await client.init();
    const body = JSON.parse(calls[0].init!.body as string);
    expect(body.platform).toBe("web");
  });

  it("sends user_hash alongside external_id for verified identity", async () => {
    const { calls } = mockFetch(() => jsonResponse(FULL_INIT_RESPONSE));
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await client.init({ externalId: "alice", userHash: "abc123" });
    const body = JSON.parse(calls[0].init!.body as string);
    expect(body.external_id).toBe("alice");
    expect(body.user_hash).toBe("abc123");
  });

  it("anonymous init sends NO external_id (the backend rejects unsigned ids)", async () => {
    const { calls } = mockFetch(() => jsonResponse(FULL_INIT_RESPONSE));
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await client.init();
    const body = JSON.parse(calls[0].init!.body as string);
    expect("external_id" in body).toBe(false);
    expect("user_hash" in body).toBe(false);
  });

  it("replays the identity token as X-HeedKit-Identity on later calls", async () => {
    const { calls } = mockFetch((call) => {
      if (call.url.includes("/vote")) return jsonResponse({ voted: true, vote_count: 1 });
      return jsonResponse(FULL_INIT_RESPONSE);
    });
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await client.init({ externalId: "alice", userHash: "abc123" });
    await client.vote("7");
    const voteHeaders = new Headers(calls[1].init!.headers as HeadersInit);
    expect(voteHeaders.get("X-HeedKit-Identity")).toBe("idtok-1");
  });
});

// ---------------------------------------------------------------------------
// anonymous identity persistence (localStorage)
// ---------------------------------------------------------------------------

describe("anonymous identity persistence", () => {
  it("persists the first anonymous identity and reuses it without a network init", async () => {
    stubLocalStorage();
    const { calls } = mockFetch((call) => {
      if (call.url.includes("/vote")) return jsonResponse({ voted: true, vote_count: 1 });
      return jsonResponse(FULL_INIT_RESPONSE);
    });

    const first = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await first.init();
    expect(calls).toHaveLength(1); // network init, persisted

    const second = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await second.init();
    expect(calls).toHaveLength(1); // hydrated from storage — no second init
    expect(second.getEndUserId()).toBe("eu-alice");
    expect(second.getProjectName()).toBe("Test");

    await second.vote("7");
    const voteHeaders = new Headers(calls[1].init!.headers as HeadersInit);
    expect(voteHeaders.get("X-HeedKit-Identity")).toBe("idtok-1");
  });

  it("an identified init supersedes (clears) the stored anonymous identity", async () => {
    const store = stubLocalStorage();
    mockFetch(() => jsonResponse(FULL_INIT_RESPONSE));

    const anon = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await anon.init();
    expect(store.size).toBe(1);

    const identified = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await identified.init({ externalId: "alice", userHash: "abc123" });
    expect(store.size).toBe(0);
  });

  it("recovers from a stale persisted identity: 401 -> fresh anonymous init -> retry once", async () => {
    stubLocalStorage();
    let votes = 0;
    const { calls } = mockFetch((call) => {
      if (call.url.includes("/vote")) {
        votes += 1;
        if (votes === 1) return jsonResponse({ error: "invalid_identity" }, 401);
        return jsonResponse({ voted: true, vote_count: 1 });
      }
      return jsonResponse({ ...FULL_INIT_RESPONSE, identity: `idtok-${calls.length + 1}` });
    });

    const first = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await first.init(); // network init #1, persisted

    const second = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await second.init(); // restored from storage
    const out = await second.vote("7"); // 401 -> re-init -> retry -> ok
    expect(out).toEqual({ voted: true, vote_count: 1 });
    // call sequence: init, vote(401), init, vote(ok)
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/sdk/init", "/sdk/features/7/vote", "/sdk/init", "/sdk/features/7/vote",
    ]);
  });

  it("hydrates theme / enabledKinds / kindVisibility / kindInteractions / endUserId", async () => {
    mockFetch(() => jsonResponse(FULL_INIT_RESPONSE));
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });

    await client.init({ externalId: "alice" });

    expect(client.getEndUserId()).toBe("eu-alice");
    expect(client.getProjectName()).toBe("Test");
    expect(client.getTheme()).toEqual({ primary: "#000000" });
    expect(client.getEnabledKinds()).toContain("feature_request");
    expect(client.getKindVisibility().bug_report).toBe("private");
    expect(client.getKindInteractions().feature_request).toEqual({
      upvote: true,
      downvote: false,
    });
  });

  it("tolerates an old server response missing kind_visibility / kind_interactions", async () => {
    const partial = {
      project_id: "p",
      project_name: "Old",
      theme: {},
      enabled_kinds: ["feature_request"],
      end_user_id: "eu",
    };
    mockFetch(() => jsonResponse(partial));
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });

    await client.init({ externalId: "alice" });
    // Falls back to empty maps rather than throwing.
    expect(client.getKindVisibility()).toEqual({});
    expect(client.getKindInteractions()).toEqual({});
    expect(client.getInteractionsFor("feature_request")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getInteractionsFor — canonical order + filtering
// ---------------------------------------------------------------------------

describe("getInteractionsFor", () => {
  it("returns enabled interactions in canonical order", async () => {
    mockFetch(() => jsonResponse(FULL_INIT_RESPONSE));
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await client.init({ externalId: "alice" });

    // Even though the JSON had `upvote: true, downvote: false`, the canonical
    // order is [upvote, downvote, plus_one, like] — only enabled ones surface.
    expect(client.getInteractionsFor("feature_request")).toEqual(["upvote"]);
    expect(client.getInteractionsFor("bug_report")).toEqual(["plus_one"]);
    expect(client.getInteractionsFor("appreciation")).toEqual(["like"]);
  });

  it("returns up+down together when both enabled", async () => {
    mockFetch(() => jsonResponse({
      ...FULL_INIT_RESPONSE,
      project: {
        ...FULL_INIT_RESPONSE.project,
        kind_interactions: {
          ...FULL_INIT_RESPONSE.project.kind_interactions,
          feature_request: { upvote: true, downvote: true },
        },
      },
    }));
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await client.init({ externalId: "alice" });
    expect(client.getInteractionsFor("feature_request")).toEqual(["upvote", "downvote"]);
  });

  it("returns empty array for a kind that has no interactions enabled", async () => {
    mockFetch(() => jsonResponse({
      ...FULL_INIT_RESPONSE,
      project: {
        ...FULL_INIT_RESPONSE.project,
        kind_interactions: { ...FULL_INIT_RESPONSE.project.kind_interactions, appreciation: { like: false } },
      },
    }));
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await client.init({ externalId: "alice" });
    expect(client.getInteractionsFor("appreciation")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// list / submit / vote — URL + payload shape
// ---------------------------------------------------------------------------

describe("list / submit / vote", () => {
  async function newReady(handler: (call: FetchCall) => Response | Promise<Response>) {
    const records = mockFetch(handler);
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await client.init({ externalId: "alice" });
    records.calls.length = 0;
    return { client, calls: records.calls };
  }

  it("list sends the provided filters (the caller is identified by header, not param)", async () => {
    const { client, calls } = await newReady((call) => {
      if (call.url.includes("/sdk/features")) return jsonResponse({ features: [], next_cursor: null });
      return jsonResponse(FULL_INIT_RESPONSE);
    });

    await client.list({ status: "planned", kind: "bug_report", sort: "new" });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/sdk/features");
    expect(url.searchParams.get("end_user_id")).toBeNull();
    expect(url.searchParams.get("status")).toBe("planned");
    expect(url.searchParams.get("kind")).toBe("bug_report");
    expect(url.searchParams.get("sort")).toBe("new");
    const headers = new Headers(calls[0].init!.headers as HeadersInit);
    expect(headers.get("X-HeedKit-Identity")).toBe("idtok-1");
  });

  it("list unwraps { features } and maps `author` -> author_name", async () => {
    const { client } = await newReady((call) => {
      if (call.url.includes("/sdk/features"))
        return jsonResponse({
          features: [ { id: 7, title: "Dark mode", status: "planned", kind: "feature_request", visibility: "public", vote_count: 3, author: "Dana", created_at: "2026-01-01T00:00:00Z" } ],
          next_cursor: null,
        });
      return jsonResponse(FULL_INIT_RESPONSE);
    });
    const features = await client.list();
    expect(features).toHaveLength(1);
    expect(features[0].id).toBe("7");
    expect(features[0].author_name).toBe("Dana");
    expect(features[0].voted).toBe(false);
    expect(features[0].on_roadmap).toBe(false);
  });

  it("listComments unwraps { comments } and maps `author` -> author_name", async () => {
    const { client } = await newReady((call) => {
      if (call.url.includes("/comments"))
        return jsonResponse({ comments: [ { id: 1, body: "yes please", author: "Sam", created_at: "2026-01-01T00:00:00Z" } ] });
      return jsonResponse(FULL_INIT_RESPONSE);
    });
    const comments = await client.listComments("7");
    expect(comments).toHaveLength(1);
    expect(comments[0].author_name).toBe("Sam");
    expect(comments[0].is_internal).toBe(false);
  });

  it("submit posts the correct body and defaults kind to feature_request", async () => {
    const { client, calls } = await newReady((call) => {
      if (call.url.endsWith("/sdk/features"))
        return jsonResponse({
          id: "f1",
          title: "x",
          description: "",
          status: "open",
          kind: "feature_request",
          visibility: "public",
          on_roadmap: false,
          tag: null,
          vote_count: 0,
          voted: false,
          platform: null,
          author_name: null,
          created_at: "2026-01-01T00:00:00Z",
        });
      return jsonResponse(FULL_INIT_RESPONSE);
    });

    await client.submit({ title: "Dark mode" });
    expect(calls).toHaveLength(1);
    expect(calls[0].init!.method).toBe("POST");
    const body = JSON.parse(calls[0].init!.body as string);
    expect(body).toEqual({
      title: "Dark mode",
      description: "",
      tag: null,
      kind: "feature_request",
    });
  });

  it("vote posts to /sdk/features/{id}/vote", async () => {
    const { client, calls } = await newReady((call) => {
      if (call.url.endsWith("/vote"))
        return jsonResponse({ voted: true, vote_count: 1 });
      return jsonResponse(FULL_INIT_RESPONSE);
    });
    const out = await client.vote("feat-42");
    expect(out).toEqual({ voted: true, vote_count: 1 });
    expect(calls[0].url).toBe("http://api/sdk/features/feat-42/vote");
  });

  it("throws Error before init when calling list/submit/vote", async () => {
    mockFetch(() => jsonResponse(FULL_INIT_RESPONSE));
    const client = new HeedKitClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await expect(client.list()).rejects.toThrow(/not initialized/);
    await expect(client.submit({ title: "x" })).rejects.toThrow(/not initialized/);
    await expect(client.vote("x")).rejects.toThrow(/not initialized/);
  });
});

// ---------------------------------------------------------------------------
// HTTP error handling
// ---------------------------------------------------------------------------

describe("error handling", () => {
  it("surfaces the Rails `error` code on a 4xx", async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ error: "invalid_project_key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = new HeedKitClient({ projectKey: "bad", apiUrl: "http://api" });
    await expect(client.init()).rejects.toThrow(/invalid_project_key/);
  });

  it("falls back to the legacy `detail` field when `error` is absent", async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ detail: "Invalid project key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = new HeedKitClient({ projectKey: "bad", apiUrl: "http://api" });
    await expect(client.init()).rejects.toThrow(/Invalid project key/);
  });

  it("falls back to HTTP <status> when the body isn't JSON", async () => {
    mockFetch(() =>
      new Response("Internal Server Error", { status: 500 })
    );
    const client = new HeedKitClient({ projectKey: "ok", apiUrl: "http://api" });
    await expect(client.init()).rejects.toThrow(/HTTP 500/);
  });
});
