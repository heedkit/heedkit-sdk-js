// FeatureKit SDK — vanilla TypeScript demo
// ------------------------------------------------------------------
// Imports the SDK straight from this repo's source (../src), not a
// published package. Vite compiles the TS on the fly.
import {
  FeatureKitClient,
  type Comment,
  type Feature,
  type FeatureKind,
} from "../src";

// ------------------------------------------------------------------
// CONFIG — edit these two, or set them via Vite env vars.
//
//   VITE_FEATUREKIT_PROJECT_KEY   public project key (starts with pk_)
//   VITE_FEATUREKIT_API_URL       Rails endpoint (no trailing /sdk)
//
// Browser code talks to the Rails dev server at featurekit.localhost:3000.
// The SDK appends "/sdk" to apiUrl itself (see client.ts request()), so
// apiUrl is the bare origin.
// ------------------------------------------------------------------
const CONFIG = {
  projectKey:
    (import.meta.env.VITE_FEATUREKIT_PROJECT_KEY as string | undefined) ??
    "pk_REPLACE_ME",
  apiUrl:
    (import.meta.env.VITE_FEATUREKIT_API_URL as string | undefined) ??
    "http://featurekit.localhost:3000",
};

// Human-friendly labels for each feature kind.
const KIND_LABELS: Record<FeatureKind, string> = {
  feature_request: "Feature request",
  bug_report: "Bug report",
  improvement: "Improvement",
  appreciation: "Appreciation",
  other: "Other",
};

// ------------------------------------------------------------------
// DOM handles
// ------------------------------------------------------------------
const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector(sel) as T;

const projectNameEl = $("#project-name");
const bannerEl = $("#config-banner");
const featuresEl = $("#features");
const sortEl = $<HTMLSelectElement>("#sort");
const reloadEl = $("#reload");
const formEl = $<HTMLFormElement>("#submit-form");
const titleEl = $<HTMLInputElement>("#title");
const descEl = $<HTMLTextAreaElement>("#description");
const kindEl = $<HTMLSelectElement>("#kind");

// ------------------------------------------------------------------
// The single SDK client used throughout the demo.
// ------------------------------------------------------------------
const client = new FeatureKitClient({
  projectKey: CONFIG.projectKey,
  apiUrl: CONFIG.apiUrl,
});

function showBanner(msg: string) {
  bannerEl.textContent = msg;
  bannerEl.hidden = false;
}

// ------------------------------------------------------------------
// 1 + 2) Configure + init/identify an end-user (POST /sdk/init).
//   init() returns { end_user_id, project } and stashes the end_user_id
//   inside the client so later calls (list/vote/submit/comment) reuse it.
//   With no externalId the SDK falls back to a stable per-browser device id.
// ------------------------------------------------------------------
async function start() {
  if (CONFIG.projectKey === "pk_REPLACE_ME") {
    showBanner(
      "Set a real project key: edit CONFIG.projectKey in main.ts or run with VITE_FEATUREKIT_PROJECT_KEY=pk_... npm run dev",
    );
  }

  try {
    const result = await client.init({
      externalId: "demo-user-web",
      name: "Demo User",
      email: "demo@example.com",
      platform: "web",
    });
    projectNameEl.textContent = result.project.name || "FeatureKit demo";
    populateKindOptions();
    await loadFeatures();
  } catch (err) {
    showBanner(
      `init failed: ${(err as Error).message}. Is the Rails server running (bin/dev) and is the project key valid?`,
    );
    featuresEl.innerHTML = `<p class="muted">Could not initialize.</p>`;
  }
}

// Populate the submit-form kind <select> with only the kinds the project
// enabled (from /sdk/init). Fall back to all kinds if none reported.
function populateKindOptions() {
  const kinds = client.getEnabledKinds();
  const list = kinds.length > 0 ? kinds : (Object.keys(KIND_LABELS) as FeatureKind[]);
  kindEl.innerHTML = "";
  for (const k of list) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = KIND_LABELS[k] ?? k;
    kindEl.appendChild(opt);
  }
}

// ------------------------------------------------------------------
// 3) Fetch & display features (GET /sdk/features).
// ------------------------------------------------------------------
async function loadFeatures() {
  featuresEl.innerHTML = `<p class="muted">Loading features…</p>`;
  try {
    const sort = sortEl.value as "top" | "new";
    const features = await client.list({ sort });
    renderFeatures(features);
  } catch (err) {
    featuresEl.innerHTML = `<p class="muted">Failed to load: ${(err as Error).message}</p>`;
  }
}

function renderFeatures(features: Feature[]) {
  featuresEl.innerHTML = "";
  if (features.length === 0) {
    featuresEl.innerHTML = `<p class="muted">No features yet — submit the first one below.</p>`;
    return;
  }
  for (const f of features) {
    featuresEl.appendChild(renderFeatureCard(f));
  }
}

function renderFeatureCard(f: Feature): HTMLElement {
  const card = document.createElement("div");
  card.className = "card";

  const head = document.createElement("div");
  head.className = "feature-head";

  // ----- 5) Upvote button (toggle) -----
  const voteBtn = document.createElement("button");
  voteBtn.className = "vote-btn";
  voteBtn.type = "button";
  voteBtn.dataset.voted = String(f.voted);
  voteBtn.innerHTML = `<span class="vote-arrow">▲</span><span class="vote-count">${f.vote_count}</span>`;
  voteBtn.addEventListener("click", async () => {
    voteBtn.disabled = true;
    try {
      // vote() toggles the caller's vote and returns the fresh state.
      const r = await client.vote(f.id);
      f.voted = r.voted;
      f.vote_count = r.vote_count;
      voteBtn.dataset.voted = String(r.voted);
      voteBtn.querySelector(".vote-count")!.textContent = String(r.vote_count);
    } catch (err) {
      alert(`Vote failed: ${(err as Error).message}`);
    } finally {
      voteBtn.disabled = false;
    }
  });
  head.appendChild(voteBtn);

  const body = document.createElement("div");
  body.className = "feature-body";

  const title = document.createElement("div");
  title.className = "feature-title";
  title.textContent = f.title;
  body.appendChild(title);

  if (f.description) {
    const desc = document.createElement("div");
    desc.className = "feature-desc";
    desc.textContent = f.description;
    body.appendChild(desc);
  }

  const badges = document.createElement("div");
  badges.className = "badges";
  badges.appendChild(badge(KIND_LABELS[f.kind] ?? f.kind));
  if (f.status && f.status !== "open") badges.appendChild(badge(f.status.replace("_", " ")));
  if (f.tag) badges.appendChild(badge(f.tag));
  body.appendChild(badges);

  // ----- 4b / 6) Comments toggle -----
  const links = document.createElement("div");
  links.className = "links";
  const commentsToggle = document.createElement("button");
  commentsToggle.className = "link-btn";
  commentsToggle.type = "button";
  commentsToggle.textContent = "Comments";
  links.appendChild(commentsToggle);
  body.appendChild(links);

  const commentsEl = document.createElement("div");
  commentsEl.className = "comments";
  commentsEl.hidden = true;
  body.appendChild(commentsEl);

  let loaded = false;
  commentsToggle.addEventListener("click", async () => {
    commentsEl.hidden = !commentsEl.hidden;
    if (!commentsEl.hidden && !loaded) {
      loaded = true;
      await loadComments(f, commentsEl);
    }
  });

  head.appendChild(body);
  card.appendChild(head);
  return card;
}

function badge(text: string): HTMLElement {
  const b = document.createElement("span");
  b.className = "badge";
  b.textContent = text;
  return b;
}

// ------------------------------------------------------------------
// 6) List + add comments (GET / POST /sdk/features/:id/comments).
// ------------------------------------------------------------------
async function loadComments(f: Feature, container: HTMLElement) {
  container.innerHTML = `<p class="muted">Loading comments…</p>`;
  try {
    const comments = await client.listComments(f.id);
    renderComments(f, comments, container);
  } catch (err) {
    container.innerHTML = `<p class="muted">Failed to load comments: ${(err as Error).message}</p>`;
  }
}

function renderComments(f: Feature, comments: Comment[], container: HTMLElement) {
  container.innerHTML = "";
  if (comments.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No comments yet.";
    container.appendChild(empty);
  } else {
    for (const c of comments) {
      const row = document.createElement("div");
      row.className = "comment";
      row.innerHTML = `<span class="comment-author">${escapeHtml(c.author_name ?? "Anonymous")}</span> — ${escapeHtml(c.body)}`;
      container.appendChild(row);
    }
  }

  // Add-comment form
  const form = document.createElement("form");
  form.className = "comment-form";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Add a comment…";
  const send = document.createElement("button");
  send.type = "submit";
  send.className = "primary";
  send.textContent = "Send";
  send.style.marginTop = "0";
  form.append(input, send);
  container.appendChild(form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    send.disabled = true;
    try {
      await client.comment(f.id, body);
      input.value = "";
      // Re-fetch so the new comment shows with its server-assigned fields.
      const refreshed = await client.listComments(f.id);
      renderComments(f, refreshed, container);
    } catch (err) {
      alert(`Comment failed: ${(err as Error).message}`);
    } finally {
      send.disabled = false;
    }
  });
}

// ------------------------------------------------------------------
// 4a) Submit a new feature (POST /sdk/features).
// ------------------------------------------------------------------
formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  if (!title) return;
  const submitBtn = formEl.querySelector("button[type=submit]") as HTMLButtonElement;
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";
  try {
    await client.submit({
      title,
      description: descEl.value.trim(),
      kind: (kindEl.value as FeatureKind) || "feature_request",
    });
    titleEl.value = "";
    descEl.value = "";
    await loadFeatures();
  } catch (err) {
    alert(`Submit failed: ${(err as Error).message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
  }
});

sortEl.addEventListener("change", loadFeatures);
reloadEl.addEventListener("click", loadFeatures);

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

void start();
