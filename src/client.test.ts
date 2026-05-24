import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackHubClient, type InitResult } from "./client";

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

const FULL_INIT_RESPONSE: InitResult = {
  project_id: "proj-1",
  project_name: "Test",
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
  end_user_id: "eu-alice",
};

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// init() — payload parsing + state hydration
// ---------------------------------------------------------------------------

describe("FeedbackHubClient.init", () => {
  it("posts identity to /sdk/init with the project key header", async () => {
    const { calls } = mockFetch(() => jsonResponse(FULL_INIT_RESPONSE));
    const client = new FeedbackHubClient({ projectKey: "fh_test", apiUrl: "http://api" });

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
    const client = new FeedbackHubClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await client.init();
    const body = JSON.parse(calls[0].init!.body as string);
    expect(body.platform).toBe("web");
  });

  it("hydrates theme / enabledKinds / kindVisibility / kindInteractions / endUserId", async () => {
    mockFetch(() => jsonResponse(FULL_INIT_RESPONSE));
    const client = new FeedbackHubClient({ projectKey: "fh_test", apiUrl: "http://api" });

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
    const client = new FeedbackHubClient({ projectKey: "fh_test", apiUrl: "http://api" });

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
    const client = new FeedbackHubClient({ projectKey: "fh_test", apiUrl: "http://api" });
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
      kind_interactions: {
        ...FULL_INIT_RESPONSE.kind_interactions,
        feature_request: { upvote: true, downvote: true },
      },
    }));
    const client = new FeedbackHubClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await client.init({ externalId: "alice" });
    expect(client.getInteractionsFor("feature_request")).toEqual(["upvote", "downvote"]);
  });

  it("returns empty array for a kind that has no interactions enabled", async () => {
    mockFetch(() => jsonResponse({
      ...FULL_INIT_RESPONSE,
      kind_interactions: { ...FULL_INIT_RESPONSE.kind_interactions, appreciation: { like: false } },
    }));
    const client = new FeedbackHubClient({ projectKey: "fh_test", apiUrl: "http://api" });
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
    const client = new FeedbackHubClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await client.init({ externalId: "alice" });
    records.calls.length = 0;
    return { client, calls: records.calls };
  }

  it("list sends end_user_id and any provided filters", async () => {
    const { client, calls } = await newReady((call) => {
      if (call.url.includes("/sdk/features")) return jsonResponse([]);
      return jsonResponse(FULL_INIT_RESPONSE);
    });

    await client.list({ status: "planned", kind: "bug_report", sort: "new" });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/sdk/features");
    expect(url.searchParams.get("end_user_id")).toBe("eu-alice");
    expect(url.searchParams.get("status")).toBe("planned");
    expect(url.searchParams.get("kind")).toBe("bug_report");
    expect(url.searchParams.get("sort")).toBe("new");
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
      end_user_id: "eu-alice",
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
    const client = new FeedbackHubClient({ projectKey: "fh_test", apiUrl: "http://api" });
    await expect(client.list()).rejects.toThrow(/not initialized/);
    await expect(client.submit({ title: "x" })).rejects.toThrow(/not initialized/);
    await expect(client.vote("x")).rejects.toThrow(/not initialized/);
  });
});

// ---------------------------------------------------------------------------
// HTTP error handling
// ---------------------------------------------------------------------------

describe("error handling", () => {
  it("surfaces the API's detail field on a 4xx", async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ detail: "Invalid project key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = new FeedbackHubClient({ projectKey: "bad", apiUrl: "http://api" });
    await expect(client.init()).rejects.toThrow(/Invalid project key/);
  });

  it("falls back to HTTP <status> when the body isn't JSON", async () => {
    mockFetch(() =>
      new Response("Internal Server Error", { status: 500 })
    );
    const client = new FeedbackHubClient({ projectKey: "ok", apiUrl: "http://api" });
    await expect(client.init()).rejects.toThrow(/HTTP 500/);
  });
});
