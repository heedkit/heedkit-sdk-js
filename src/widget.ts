import {
  FeedbackHubClient,
  type Comment,
  type Feature,
  type FeatureKind,
  type FeedbackHubConfig,
  type Interaction,
  type Theme,
} from "./client";

// ---------------------------------------------------------------------------
// Configuration tables
// ---------------------------------------------------------------------------

const KIND_OPTIONS: Record<FeatureKind, { label: string; placeholder: string; tabIcon: string }> = {
  feature_request: { label: "Features",      placeholder: "What should we build?",  tabIcon: "💡" },
  bug_report:      { label: "Bugs",          placeholder: "What's broken?",          tabIcon: "🐞" },
  improvement:     { label: "Improvements",  placeholder: "What could be better?",   tabIcon: "✨" },
  appreciation:    { label: "Appreciation",  placeholder: "What did you love?",      tabIcon: "❤️" },
  other:           { label: "Other",         placeholder: "Tell us anything",        tabIcon: "💬" },
};

// Icons + a11y labels per interaction. We render only those the admin enabled.
const INTERACTION_META: Record<Interaction, { icon: string; label: string }> = {
  upvote:   { icon: "▲",  label: "Upvote" },
  downvote: { icon: "▼",  label: "Downvote" },
  plus_one: { icon: "+1", label: "+1" },
  like:     { icon: "♥",  label: "Like" },
};

const FONT_SIZES = { sm: "13px", md: "14px", lg: "16px" } as const;

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export type MountOptions = FeedbackHubConfig & {
  label?: string;
  hideLauncher?: boolean;
  container?: HTMLElement;
};

export type Widget = {
  client: FeedbackHubClient;
  open: () => void;
  close: () => void;
  destroy: () => void;
};

// ---------------------------------------------------------------------------
// Style sheet (single inject; relies on CSS custom properties for theming)
// ---------------------------------------------------------------------------

const STYLE_ID = "feedbackhub-styles";

const CSS = `
.fh-launcher {
  position: fixed; bottom: 24px; right: 24px; z-index: 2147483645;
  background: var(--fh-primary); color: #fff; border: 0; border-radius: 999px;
  padding: 12px 18px; font-weight: 600; font-size: var(--fh-fs); cursor: pointer;
  box-shadow: 0 10px 24px rgba(0,0,0,.18); font-family: var(--fh-font);
  transition: transform .15s ease;
}
.fh-launcher:hover { transform: translateY(-1px); }
.fh-overlay {
  position: fixed; inset: 0; z-index: 2147483646; display: flex;
  align-items: center; justify-content: center; padding: 16px;
  background: rgba(0,0,0,.45); backdrop-filter: blur(2px);
  font-family: var(--fh-font); font-size: var(--fh-fs);
}
.fh-panel {
  width: 100%; max-width: 520px; max-height: 85vh; display: flex; flex-direction: column;
  background: var(--fh-bg); color: var(--fh-fg);
  border-radius: calc(var(--fh-radius) * 1.5); overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.3);
}
.fh-head { padding: 18px 20px 12px; border-bottom: 1px solid var(--fh-border); }
.fh-titlerow { display:flex; justify-content:space-between; align-items:center; }
.fh-title { font-size: calc(var(--fh-fs) + 6px); font-weight: 700; }
.fh-close {
  background: transparent; border: 0; color: var(--fh-muted);
  font-size: 22px; cursor: pointer; line-height: 1; padding: 0 4px;
}
.fh-modes { display:flex; gap: 6px; margin-top: 12px; }
.fh-mode {
  border: 0; background: transparent; padding: 6px 12px; border-radius: 999px;
  font-size: calc(var(--fh-fs) - 1px); font-weight: 600; cursor: pointer;
  color: var(--fh-muted); font-family: inherit;
}
.fh-mode[data-active="true"] { background: var(--fh-primary); color: #fff; }
.fh-tabs {
  display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 20px; border-bottom: 1px solid var(--fh-border);
}
.fh-tab {
  border: 0; background: var(--fh-row); color: var(--fh-fg);
  padding: 6px 12px; border-radius: 999px;
  font-size: calc(var(--fh-fs) - 1px); font-weight: 500; cursor: pointer; font-family: inherit;
  display: inline-flex; align-items: center; gap: 6px;
}
.fh-tab[data-active="true"] { background: var(--fh-primary); color: #fff; }
.fh-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.fh-empty { text-align: center; padding: 32px; opacity: .6; }
.fh-loading { text-align: center; padding: 32px; opacity: .6; }
.fh-row {
  display: flex; gap: 12px; padding: 12px; margin-bottom: 8px;
  background: var(--fh-row); border-radius: var(--fh-radius);
}
.fh-actions { display:flex; flex-direction: column; gap: 4px; }
.fh-act {
  border: 1px solid var(--fh-border); background: transparent;
  color: var(--fh-fg); border-radius: calc(var(--fh-radius) - 4px);
  min-width: 44px; padding: 6px 8px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  font-weight: 600; font-size: calc(var(--fh-fs) - 1px); font-family: inherit;
}
.fh-act[data-voted="true"] {
  border: 2px solid var(--fh-primary);
  background: color-mix(in srgb, var(--fh-primary) 14%, transparent);
  color: var(--fh-primary);
}
.fh-act[disabled] { cursor: default; opacity: .85; }
.fh-act .fh-glyph { font-size: calc(var(--fh-fs) + 1px); line-height: 1; }
.fh-meta { flex:1; min-width:0; cursor: pointer; }
.fh-item-title { font-weight: 600; }
.fh-item-desc { opacity: .7; font-size: calc(var(--fh-fs) - 1px); margin-top: 4px; }
.fh-item-badges { display:flex; gap:6px; margin-top:6px; flex-wrap: wrap; }
.fh-badge {
  font-size: calc(var(--fh-fs) - 3px); padding: 2px 8px; border-radius: 999px;
  background: var(--fh-border); color: var(--fh-muted); text-transform: uppercase; letter-spacing: .04em;
}
.fh-badge[data-status="planned"] { background: rgba(59,130,246,.15); color: rgb(37,99,235); }
.fh-badge[data-status="in_progress"] { background: rgba(234,179,8,.18); color: rgb(161,98,7); }
.fh-badge[data-status="shipped"] { background: rgba(34,197,94,.18); color: rgb(22,101,52); }
.fh-comments { margin-top: 10px; border-top: 1px solid var(--fh-border); padding-top: 10px; }
.fh-comment { padding: 6px 0; border-top: 1px dashed var(--fh-border); font-size: calc(var(--fh-fs) - 1px); }
.fh-comment:first-child { border-top: 0; }
.fh-comment-author { font-weight: 600; }
.fh-form { display: flex; flex-direction: column; gap: 12px; }
.fh-label { font-size: calc(var(--fh-fs) - 1px); font-weight: 500; }
.fh-input, .fh-textarea {
  width: 100%; padding: 10px 12px; margin-top: 4px;
  border-radius: calc(var(--fh-radius) - 2px);
  border: 1px solid var(--fh-input-border); background: var(--fh-input-bg);
  color: var(--fh-fg); font-size: var(--fh-fs); font-family: inherit;
  box-sizing: border-box;
}
.fh-textarea { resize: vertical; min-height: 96px; }
.fh-input:focus, .fh-textarea:focus { outline: 2px solid var(--fh-primary); outline-offset: 1px; }
.fh-submit {
  background: var(--fh-primary); color: #fff; border: 0;
  padding: 12px 14px; border-radius: var(--fh-radius);
  font-weight: 600; font-size: var(--fh-fs); cursor: pointer; font-family: inherit;
}
.fh-submit[disabled] { opacity: .6; cursor: not-allowed; }
.fh-segmented {
  display: inline-flex; gap: 4px; padding: 4px; margin-top: 6px;
  background: var(--fh-row); border-radius: 999px;
}
.fh-seg {
  border: 0; background: transparent; cursor: pointer;
  padding: 6px 12px; border-radius: 999px; font-size: calc(var(--fh-fs) - 2px);
  font-weight: 500; color: var(--fh-muted); font-family: inherit;
}
.fh-seg[data-active="true"] {
  background: var(--fh-bg); color: var(--fh-fg);
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04);
}
.fh-error { color: rgb(220,38,38); font-size: calc(var(--fh-fs) - 1px); }
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

// Resolve "system" mode by reading the OS preference at render time. The theme
// object is otherwise untouched.
function effectiveMode(theme: Theme): "light" | "dark" {
  const m = theme.mode || "light";
  if (m === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return m === "dark" ? "dark" : "light";
}

function applyTheme(root: HTMLElement, theme: Theme) {
  const primary = theme.primary || "#0D9488";
  const radius = `${theme.radius ?? 12}px`;
  const dark = effectiveMode(theme) === "dark";
  const font = theme.font_family || theme.fontFamily || "system-ui, -apple-system, sans-serif";
  const fs = FONT_SIZES[theme.font_size ?? "md"] ?? FONT_SIZES.md;
  const vars: Record<string, string> = {
    "--fh-primary": primary,
    "--fh-radius": radius,
    "--fh-font": font,
    "--fh-fs": fs,
    "--fh-bg": dark ? "#0F172A" : "#FFFFFF",
    "--fh-fg": dark ? "#F1F5F9" : "#0F172A",
    "--fh-muted": dark ? "#94A3B8" : "#64748B",
    "--fh-row": dark ? "#1E293B" : "#F8FAFC",
    "--fh-border": dark ? "#1E293B" : "#E2E8F0",
    "--fh-input-bg": dark ? "#0F172A" : "#FFFFFF",
    "--fh-input-border": dark ? "#334155" : "#CBD5E1",
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  if (children) {
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return node;
}

// ---------------------------------------------------------------------------
// mount() — entry point
// ---------------------------------------------------------------------------

export function mount(options: MountOptions): Widget {
  injectStyles();

  const container = options.container || document.body;
  const client = new FeedbackHubClient(options);

  const initPromise = client.init(options.user || {});

  let overlay: HTMLDivElement | null = null;
  let launcher: HTMLButtonElement | null = null;

  function close() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  async function open() {
    const r = await initPromise;
    if (overlay) return;
    overlay = renderPanel(client, r.theme, close);
    container.appendChild(overlay);
  }

  if (!options.hideLauncher) {
    initPromise.then((r) => {
      launcher = el("button", { class: "fh-launcher", type: "button" }, [
        options.label || "Feedback",
      ]) as HTMLButtonElement;
      applyTheme(launcher, r.theme);
      launcher.addEventListener("click", open);
      container.appendChild(launcher);
    });
  }

  return {
    client,
    open,
    close,
    destroy() {
      close();
      launcher?.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// Panel rendering
// ---------------------------------------------------------------------------

function renderPanel(
  client: FeedbackHubClient,
  theme: Theme,
  onClose: () => void,
): HTMLDivElement {
  const overlay = el("div", { class: "fh-overlay", role: "dialog" }) as HTMLDivElement;
  applyTheme(overlay, theme);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) onClose();
  });

  const panel = el("div", { class: "fh-panel" });
  overlay.appendChild(panel);

  // -- state -------------------------------------------------------------
  type Mode = "browse" | "suggest";
  const enabledKinds = client.getEnabledKinds();
  const groupMode = theme.group_mode || "tabs";
  // tabs mode: one tab per enabled kind, plus mixed "All". list mode: no kind tabs.
  let mode: Mode = "browse";
  let activeKind: FeatureKind | "all" = groupMode === "tabs" && enabledKinds.length > 0 ? enabledKinds[0] : "all";
  let features: Feature[] = [];

  // -- header -----------------------------------------------------------
  const head = el("div", { class: "fh-head" });
  const titlerow = el("div", { class: "fh-titlerow" });
  titlerow.appendChild(el("div", { class: "fh-title" }, [client.getProjectName() || "Feedback"]));
  const closeBtn = el("button", { class: "fh-close", type: "button", "aria-label": "Close" }, ["×"]);
  closeBtn.addEventListener("click", onClose);
  titlerow.appendChild(closeBtn);
  head.appendChild(titlerow);

  const modes = el("div", { class: "fh-modes" });
  const modeBrowse = el("button", { class: "fh-mode", type: "button" }, ["Browse"]) as HTMLButtonElement;
  const modeSuggest = el("button", { class: "fh-mode", type: "button" }, ["Suggest"]) as HTMLButtonElement;
  modes.append(modeBrowse, modeSuggest);
  head.appendChild(modes);
  panel.appendChild(head);

  // -- tabs row (tabs mode only) ----------------------------------------
  let tabsEl: HTMLElement | null = null;
  if (groupMode === "tabs" && enabledKinds.length > 0) {
    tabsEl = el("div", { class: "fh-tabs" });
    const all = el("button", { class: "fh-tab", type: "button" }, ["All"]) as HTMLButtonElement;
    all.dataset.kind = "all";
    tabsEl.appendChild(all);
    for (const k of enabledKinds) {
      const meta = KIND_OPTIONS[k];
      const tab = el("button", { class: "fh-tab", type: "button" }, [
        el("span", {}, [meta.tabIcon]),
        el("span", {}, [meta.label]),
      ]) as HTMLButtonElement;
      tab.dataset.kind = k;
      tabsEl.appendChild(tab);
    }
    panel.appendChild(tabsEl);
    tabsEl.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest("[data-kind]") as HTMLElement | null;
      if (!target) return;
      activeKind = target.dataset.kind as FeatureKind | "all";
      paintTabs();
      refresh();
    });
  }

  // -- body -------------------------------------------------------------
  const body = el("div", { class: "fh-body" });
  panel.appendChild(body);

  // -- helpers ----------------------------------------------------------

  function paintModes() {
    modeBrowse.setAttribute("data-active", String(mode === "browse"));
    modeSuggest.setAttribute("data-active", String(mode === "suggest"));
    if (tabsEl) tabsEl.style.display = mode === "browse" ? "" : "none";
  }

  function paintTabs() {
    if (!tabsEl) return;
    for (const t of Array.from(tabsEl.children)) {
      (t as HTMLElement).setAttribute(
        "data-active",
        String((t as HTMLElement).dataset.kind === String(activeKind)),
      );
    }
  }

  async function refresh() {
    body.replaceChildren(el("div", { class: "fh-loading" }, ["Loading…"]));
    try {
      const opts: { sort: "top" | "new"; kind?: FeatureKind } = { sort: "top" };
      if (activeKind !== "all") opts.kind = activeKind;
      features = await client.list(opts);
    } catch (e) {
      body.replaceChildren(
        el("div", { class: "fh-empty" }, [`Failed to load: ${(e as Error).message}`]),
      );
      return;
    }
    renderList();
  }

  // Toggle a single interaction. For upvote/downvote we mirror "press one,
  // press it again to undo, press the other to flip". For +1/like we just toggle.
  async function performAction(f: Feature, interaction: Interaction) {
    // The backend currently exposes a single /vote toggle endpoint regardless of
    // interaction type — all four collapse to the same row-count in this MVP.
    // (When a separate downvote endpoint is added we can branch here.)
    const r = await client.vote(f.id);
    f.voted = r.voted;
    f.vote_count = r.vote_count;
    renderList();
  }

  function renderActions(f: Feature): HTMLElement {
    const interactions = client.getInteractionsFor(f.kind);
    const showCount = (client.getTheme().show_counts || {})[f.kind] !== false;
    const wrap = el("div", { class: "fh-actions" });

    if (interactions.length === 0) {
      // Read-only mode: just show the count (if visible).
      if (showCount) {
        const btn = el("button", { class: "fh-act", type: "button", disabled: "true" }, [
          el("span", {}, [String(f.vote_count)]),
        ]);
        wrap.appendChild(btn);
      }
      return wrap;
    }

    for (const i of interactions) {
      const meta = INTERACTION_META[i];
      const btn = el("button", {
        class: "fh-act",
        type: "button",
        "aria-label": meta.label,
      }, [
        el("span", { class: "fh-glyph" }, [meta.icon]),
        ...(showCount ? [el("span", {}, [String(f.vote_count)])] : []),
      ]) as HTMLButtonElement;
      if (i === "upvote" || i === "like" || i === "plus_one") {
        btn.setAttribute("data-voted", String(f.voted));
      }
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        performAction(f, i);
      });
      wrap.appendChild(btn);
    }
    return wrap;
  }

  function renderList() {
    body.innerHTML = "";
    if (features.length === 0) {
      body.appendChild(el("div", { class: "fh-empty" }, ["No items yet — be the first!"]));
      return;
    }
    for (const f of features) {
      body.appendChild(renderRow(f));
    }
  }

  // A row collapses by default; clicking the meta column reveals comments.
  function renderRow(f: Feature): HTMLElement {
    const row = el("div", { class: "fh-row" });
    row.appendChild(renderActions(f));

    const meta = el("div", { class: "fh-meta" });
    meta.appendChild(el("div", { class: "fh-item-title" }, [f.title]));
    if (f.description) meta.appendChild(el("div", { class: "fh-item-desc" }, [f.description]));

    const badges = el("div", { class: "fh-item-badges" });
    if (f.status && f.status !== "open") {
      const b = el("span", { class: "fh-badge" }, [f.status.replace("_", " ")]);
      b.setAttribute("data-status", f.status);
      badges.appendChild(b);
    }
    if (f.tag) badges.appendChild(el("span", { class: "fh-badge" }, [f.tag]));
    if (badges.children.length) meta.appendChild(badges);

    let commentsLoaded = false;
    const commentsEl = el("div", { class: "fh-comments" });
    commentsEl.style.display = "none";
    meta.appendChild(commentsEl);

    meta.addEventListener("click", async () => {
      const opening = commentsEl.style.display === "none";
      commentsEl.style.display = opening ? "" : "none";
      if (opening && !commentsLoaded) {
        commentsLoaded = true;
        commentsEl.replaceChildren(el("div", { class: "fh-loading" }, ["Loading…"]));
        try {
          const cs = await client.listComments(f.id);
          commentsEl.replaceChildren(...renderComments(f, cs));
        } catch (e) {
          commentsEl.replaceChildren(
            el("div", { class: "fh-error" }, [(e as Error).message]),
          );
        }
      }
    });

    row.appendChild(meta);
    return row;
  }

  function renderComments(f: Feature, comments: Comment[]): HTMLElement[] {
    const nodes: HTMLElement[] = [];
    if (comments.length === 0) {
      nodes.push(el("div", { class: "fh-empty" }, ["No replies yet."]));
    } else {
      for (const c of comments) {
        nodes.push(el("div", { class: "fh-comment" }, [
          el("span", { class: "fh-comment-author" }, [c.author_name || "Anonymous"]),
          " — ",
          c.body,
        ]));
      }
    }
    // Comment input
    const input = el("textarea", {
      class: "fh-textarea",
      placeholder: "Add a reply…",
      rows: "2",
    }) as HTMLTextAreaElement;
    const send = el("button", { class: "fh-submit", type: "button" }, ["Reply"]) as HTMLButtonElement;
    send.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!input.value.trim()) return;
      send.disabled = true;
      try {
        const c = await client.comment(f.id, input.value);
        input.value = "";
        send.disabled = false;
        // Refresh inline.
        const refreshed = await client.listComments(f.id);
        // Replace the surrounding comments block. Find parent and re-render.
        const parent = send.parentElement?.parentElement;
        if (parent) parent.replaceChildren(...renderComments(f, refreshed));
      } catch (err) {
        send.disabled = false;
        alert((err as Error).message);
      }
    });
    nodes.push(el("div", {}, [input, send]));
    return nodes;
  }

  // ---- Suggest form --------------------------------------------------

  function renderForm() {
    body.innerHTML = "";
    const enabled = client.getEnabledKinds();
    const enabledOptions = enabled.map((value) => ({ value, ...KIND_OPTIONS[value] }));
    const safeOptions = enabledOptions.length > 0 ? enabledOptions : [
      { value: "other" as FeatureKind, ...KIND_OPTIONS.other },
    ];
    let kind: FeatureKind = safeOptions[0].value;

    const form = el("form", { class: "fh-form" }) as HTMLFormElement;

    const kindLabel = el("label", { class: "fh-label" }, ["What's this about?"]);
    const segmented = el("div", { class: "fh-segmented" });
    const segButtons: HTMLButtonElement[] = [];
    for (const opt of safeOptions) {
      const btn = el("button", { class: "fh-seg", type: "button" }, [opt.label]) as HTMLButtonElement;
      btn.setAttribute("data-active", String(opt.value === kind));
      btn.addEventListener("click", () => {
        kind = opt.value;
        segButtons.forEach((b, i) =>
          b.setAttribute("data-active", String(safeOptions[i].value === kind)),
        );
        titleInput.placeholder = safeOptions.find((o) => o.value === kind)!.placeholder;
      });
      segButtons.push(btn);
      segmented.appendChild(btn);
    }
    kindLabel.appendChild(segmented);

    const titleLabel = el("label", { class: "fh-label" }, ["Title"]);
    const titleInput = el("input", {
      class: "fh-input",
      type: "text",
      placeholder: safeOptions[0].placeholder,
      required: "true",
    }) as HTMLInputElement;
    titleLabel.appendChild(titleInput);

    const descLabel = el("label", { class: "fh-label" }, ["Description"]);
    const descInput = el("textarea", {
      class: "fh-textarea",
      placeholder: "Any extra context helps.",
      rows: "4",
    }) as HTMLTextAreaElement;
    descLabel.appendChild(descInput);

    const submit = el("button", { class: "fh-submit", type: "submit" }, ["Submit"]) as HTMLButtonElement;

    form.append(kindLabel, titleLabel, descLabel, submit);
    body.appendChild(form);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!titleInput.value.trim()) return;
      submit.disabled = true;
      submit.textContent = "Submitting…";
      try {
        await client.submit({
          title: titleInput.value,
          description: descInput.value,
          kind,
        });
        titleInput.value = "";
        descInput.value = "";
        setMode("browse");
        // Land on the tab of what they just posted, so they see their submission.
        if (tabsEl) {
          activeKind = kind;
          paintTabs();
        }
        await refresh();
      } catch (err) {
        submit.disabled = false;
        submit.textContent = "Submit";
        alert((err as Error).message);
      }
    });
  }

  function setMode(m: Mode) {
    mode = m;
    paintModes();
    if (mode === "browse") refresh();
    else renderForm();
  }

  modeBrowse.addEventListener("click", () => setMode("browse"));
  modeSuggest.addEventListener("click", () => setMode("suggest"));

  paintModes();
  paintTabs();
  setMode("browse");

  return overlay;
}
