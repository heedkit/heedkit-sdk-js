import {
  HeedKitClient,
  type Comment,
  type Feature,
  type FeatureKind,
  type HeedKitConfig,
  type InitResult,
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

export type MountOptions = HeedKitConfig & {
  label?: string;
  hideLauncher?: boolean;
  container?: HTMLElement;
};

export type Widget = {
  client: HeedKitClient;
  open: () => void;
  close: () => void;
  destroy: () => void;
};

// ---------------------------------------------------------------------------
// Style sheet (single inject; relies on CSS custom properties for theming)
// ---------------------------------------------------------------------------

const STYLE_ID = "heedkit-styles";

const CSS = `
.fk-launcher {
  position: fixed; bottom: 24px; right: 24px; z-index: 2147483645;
  background: var(--fh-primary); color: #fff; border: 0; border-radius: 999px;
  padding: 11px 18px; font-weight: 600; font-size: var(--fh-fs); cursor: pointer;
  font-family: var(--fh-font); letter-spacing: .01em; line-height: 1.2;
  -webkit-font-smoothing: antialiased;
  box-shadow: 0 2px 6px rgba(0,0,0,.12), 0 10px 28px rgba(0,0,0,.16);
  transition: transform .15s ease, box-shadow .15s ease;
}
.fk-launcher:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,.14), 0 14px 34px rgba(0,0,0,.2); }
.fk-launcher:active { transform: translateY(0); }
.fk-overlay {
  position: fixed; inset: 0; z-index: 2147483646; display: flex;
  align-items: center; justify-content: center; padding: 16px;
  background: rgba(15,23,42,.48); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
  font-family: var(--fh-font); font-size: var(--fh-fs); line-height: 1.45;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  animation: fk-fade .16s ease-out;
}
.fk-overlay *, .fk-overlay *::before, .fk-overlay *::after { box-sizing: border-box; margin: 0; }
.fk-panel {
  /* FIXED height (not max-height): the panel must not jump when switching between
     a full list, an empty tab, and the suggest form. The body scrolls internally. */
  width: 100%; max-width: 520px; height: min(640px, 85vh); display: flex; flex-direction: column;
  background: var(--fh-bg); color: var(--fh-fg);
  border: 1px solid color-mix(in srgb, var(--fh-border) 60%, transparent);
  border-radius: calc(var(--fh-radius) + 6px); overflow: hidden;
  box-shadow: 0 8px 24px rgba(0,0,0,.12), 0 32px 80px rgba(0,0,0,.28);
  animation: fk-pop .18s cubic-bezier(.16,1,.3,1);
}
@keyframes fk-fade { from { opacity: 0; } }
@keyframes fk-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
@media (prefers-reduced-motion: reduce) { .fk-overlay, .fk-panel { animation: none; } }
.fk-overlay button:focus-visible, .fk-launcher:focus-visible { outline: 2px solid var(--fh-primary); outline-offset: 2px; }
.fk-head { padding: 16px 20px 12px; border-bottom: 1px solid var(--fh-border); }
.fk-titlerow { display:flex; justify-content:space-between; align-items:center; }
.fk-title { font-size: calc(var(--fh-fs) + 4px); font-weight: 700; letter-spacing: -0.01em; }
.fk-close {
  background: transparent; border: 0; color: var(--fh-muted);
  font-size: 20px; cursor: pointer; line-height: 1;
  width: 30px; height: 30px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center;
  transition: background .12s ease, color .12s ease;
}
.fk-close:hover { background: var(--fh-row); color: var(--fh-fg); }
.fk-modes { display:flex; gap: 4px; margin-top: 12px; }
.fk-mode {
  border: 0; background: transparent; padding: 6px 14px; border-radius: 999px;
  font-size: calc(var(--fh-fs) - 1px); font-weight: 600; cursor: pointer;
  color: var(--fh-muted); font-family: inherit; line-height: 1.4;
  transition: background .12s ease, color .12s ease;
}
.fk-mode:hover { background: var(--fh-row); color: var(--fh-fg); }
.fk-mode[data-active="true"] { background: var(--fh-primary); color: #fff; }
.fk-tabs {
  display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 20px; border-bottom: 1px solid var(--fh-border);
}
.fk-tab {
  border: 1px solid transparent; background: var(--fh-row); color: var(--fh-muted);
  padding: 5px 12px; border-radius: 999px;
  font-size: calc(var(--fh-fs) - 1px); font-weight: 500; cursor: pointer; font-family: inherit;
  display: inline-flex; align-items: center; gap: 6px; line-height: 1.4;
  transition: color .12s ease, border-color .12s ease, background .12s ease;
}
.fk-tab:hover { color: var(--fh-fg); border-color: var(--fh-border); }
.fk-tab[data-active="true"] { background: var(--fh-primary); border-color: var(--fh-primary); color: #fff; }
.fk-body {
  flex: 1; overflow-y: auto; padding: 14px 20px 18px; scrollbar-width: thin;
  display: flex; flex-direction: column;
}
.fk-empty, .fk-loading { text-align: center; padding: 20px; color: var(--fh-muted); margin: auto; }
.fk-row {
  flex-shrink: 0;
  display: flex; gap: 12px; padding: 12px 14px; margin-bottom: 8px;
  background: var(--fh-row); border: 1px solid transparent; border-radius: var(--fh-radius);
  transition: border-color .12s ease;
}
.fk-row:hover { border-color: var(--fh-border); }
.fk-actions { display:flex; flex-direction: column; gap: 4px; align-self: flex-start; }
.fk-act {
  border: 1px solid var(--fh-border); background: var(--fh-bg);
  color: var(--fh-muted); border-radius: calc(var(--fh-radius) - 4px);
  min-width: 42px; padding: 7px 6px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  font-weight: 600; font-size: calc(var(--fh-fs) - 1px); font-family: inherit; line-height: 1;
  transition: border-color .12s ease, color .12s ease, background .12s ease, transform .08s ease;
}
.fk-act:hover { border-color: color-mix(in srgb, var(--fh-primary) 55%, var(--fh-border)); color: var(--fh-primary); }
.fk-act:active { transform: scale(.95); }
.fk-act[data-voted="true"] {
  border-color: var(--fh-primary);
  background: color-mix(in srgb, var(--fh-primary) 12%, var(--fh-bg));
  color: var(--fh-primary);
}
.fk-act[disabled] { cursor: default; opacity: .8; }
.fk-act .fk-glyph { font-size: calc(var(--fh-fs) - 2px); line-height: 1; }
.fk-meta { flex:1; min-width:0; cursor: pointer; padding-top: 2px; }
.fk-item-title { font-weight: 600; line-height: 1.35; }
.fk-item-desc {
  color: var(--fh-muted); font-size: calc(var(--fh-fs) - 1px); margin-top: 3px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.fk-item-badges { display:flex; gap:6px; margin-top:8px; flex-wrap: wrap; }
.fk-badge {
  font-size: calc(var(--fh-fs) - 4px); padding: 2px 8px; border-radius: 999px; font-weight: 600;
  background: var(--fh-border); color: var(--fh-muted); text-transform: uppercase; letter-spacing: .05em;
  line-height: 1.6;
}
.fk-badge[data-status="planned"] { background: rgba(59,130,246,.15); color: rgb(37,99,235); }
.fk-badge[data-status="in_progress"] { background: rgba(234,179,8,.18); color: rgb(161,98,7); }
.fk-badge[data-status="shipped"] { background: rgba(34,197,94,.18); color: rgb(22,101,52); }
.fk-comments { margin-top: 10px; border-top: 1px solid var(--fh-border); padding-top: 8px; cursor: default; }
.fk-comment { padding: 6px 0; font-size: calc(var(--fh-fs) - 1px); }
.fk-comment + .fk-comment { border-top: 1px dashed var(--fh-border); }
.fk-comment-author { font-weight: 600; }
.fk-reply { display: flex; gap: 8px; margin-top: 8px; align-items: flex-end; }
.fk-reply .fk-textarea { margin-top: 0; min-height: 44px; }
.fk-reply .fk-submit { padding: 10px 16px; }
.fk-form { display: flex; flex-direction: column; gap: 14px; flex: 1; }
.fk-label { font-size: calc(var(--fh-fs) - 1px); font-weight: 600; display: block; }
/* The description field absorbs the panel's fixed height, so the suggest form
   fills the same space a full browse list does. */
.fk-grow { flex: 1; display: flex; flex-direction: column; }
.fk-grow .fk-textarea { flex: 1; }
.fk-input, .fk-textarea {
  width: 100%; padding: 10px 12px; margin-top: 6px;
  border-radius: calc(var(--fh-radius) - 2px);
  border: 1px solid var(--fh-input-border); background: var(--fh-input-bg);
  color: var(--fh-fg); font-size: var(--fh-fs); font-family: inherit; line-height: 1.45;
  transition: border-color .12s ease, box-shadow .12s ease;
}
.fk-input::placeholder, .fk-textarea::placeholder { color: var(--fh-muted); opacity: .8; }
.fk-textarea { resize: vertical; min-height: 96px; }
.fk-input:focus, .fk-textarea:focus {
  outline: none; border-color: var(--fh-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--fh-primary) 18%, transparent);
}
.fk-submit {
  background: var(--fh-primary); color: #fff; border: 0;
  padding: 11px 16px; border-radius: calc(var(--fh-radius) - 2px);
  font-weight: 600; font-size: var(--fh-fs); cursor: pointer; font-family: inherit; line-height: 1.4;
  transition: filter .12s ease, transform .08s ease;
}
.fk-submit:hover { filter: brightness(1.06); }
.fk-submit:active { transform: scale(.99); }
.fk-submit[disabled] { opacity: .6; cursor: not-allowed; }
.fk-segmented {
  display: inline-flex; gap: 4px; padding: 4px; margin-top: 6px;
  background: var(--fh-row); border-radius: 999px; flex-wrap: wrap;
}
.fk-seg {
  border: 0; background: transparent; cursor: pointer;
  padding: 5px 12px; border-radius: 999px; font-size: calc(var(--fh-fs) - 2px);
  font-weight: 500; color: var(--fh-muted); font-family: inherit; line-height: 1.4;
  transition: color .12s ease;
}
.fk-seg:hover { color: var(--fh-fg); }
.fk-seg[data-active="true"] {
  background: var(--fh-bg); color: var(--fh-fg);
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04);
}
.fk-error { color: rgb(220,38,38); font-size: calc(var(--fh-fs) - 1px); }
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

const FONT_FALLBACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Themes arrive as JSON: radius may be a number (12) or a CSS length string
// ("0.75rem" — the Rails default). Anything else falls back, because an invalid
// var(--fh-radius) would zero out every border-radius that uses it.
function cssLength(v: unknown, fallbackPx: number): string {
  if (typeof v === "number" && Number.isFinite(v)) return `${v}px`;
  if (typeof v === "string" && /^\d*\.?\d+(px|rem|em)$/.test(v.trim())) return v.trim();
  return `${fallbackPx}px`;
}

function applyTheme(root: HTMLElement, theme: Theme) {
  const primary = theme.primary || "#0D9488";
  const radius = cssLength(theme.radius, 12);
  const dark = effectiveMode(theme) === "dark";
  // Always append the system stack: a theme naming a font the host page never
  // loads ("Inter") must degrade to a clean sans, not the browser-default serif.
  const themedFont = theme.font_family || theme.fontFamily;
  const font = themedFont ? `${themedFont}, ${FONT_FALLBACK}` : FONT_FALLBACK;
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
  const client = new HeedKitClient(options);

  // Silence init failures (bad project key, network down, API offline) so
  // they don't surface as unhandled promise rejections in the host page —
  // a marketing visitor should never see a Next.js error overlay because
  // our init 401'd. The launcher just doesn't show; open() no-ops.
  const initPromise: Promise<InitResult | null> = client.init(options.user || {}).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn("[HeedKit] widget init failed; launcher disabled.", e);
    return null;
  });

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
    if (!r) return;  // init failed; nothing to render
    if (overlay) return;
    overlay = renderPanel(client, client.getTheme(), close);
    container.appendChild(overlay);
  }

  if (!options.hideLauncher) {
    initPromise.then((r) => {
      if (!r) return;  // init failed; skip the launcher entirely
      launcher = el("button", { class: "fk-launcher", type: "button" }, [
        options.label || "Feedback",
      ]) as HTMLButtonElement;
      applyTheme(launcher, client.getTheme());
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
  client: HeedKitClient,
  theme: Theme,
  onClose: () => void,
): HTMLDivElement {
  const overlay = el("div", { class: "fk-overlay", role: "dialog" }) as HTMLDivElement;
  applyTheme(overlay, theme);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) onClose();
  });

  const panel = el("div", { class: "fk-panel" });
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
  const head = el("div", { class: "fk-head" });
  const titlerow = el("div", { class: "fk-titlerow" });
  titlerow.appendChild(el("div", { class: "fk-title" }, [client.getProjectName() || "Feedback"]));
  const closeBtn = el("button", { class: "fk-close", type: "button", "aria-label": "Close" }, ["×"]);
  closeBtn.addEventListener("click", onClose);
  titlerow.appendChild(closeBtn);
  head.appendChild(titlerow);

  const modes = el("div", { class: "fk-modes" });
  const modeBrowse = el("button", { class: "fk-mode", type: "button" }, ["Browse"]) as HTMLButtonElement;
  const modeSuggest = el("button", { class: "fk-mode", type: "button" }, ["Suggest"]) as HTMLButtonElement;
  modes.append(modeBrowse, modeSuggest);
  head.appendChild(modes);
  panel.appendChild(head);

  // -- tabs row (tabs mode only) ----------------------------------------
  let tabsEl: HTMLElement | null = null;
  if (groupMode === "tabs" && enabledKinds.length > 0) {
    tabsEl = el("div", { class: "fk-tabs" });
    const all = el("button", { class: "fk-tab", type: "button" }, ["All"]) as HTMLButtonElement;
    all.dataset.kind = "all";
    tabsEl.appendChild(all);
    for (const k of enabledKinds) {
      const meta = KIND_OPTIONS[k];
      const tab = el("button", { class: "fk-tab", type: "button" }, [
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
  const body = el("div", { class: "fk-body" });
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
    body.replaceChildren(el("div", { class: "fk-loading" }, ["Loading…"]));
    try {
      const opts: { sort: "top" | "new"; kind?: FeatureKind } = { sort: "top" };
      if (activeKind !== "all") opts.kind = activeKind;
      features = await client.list(opts);
    } catch (e) {
      body.replaceChildren(
        el("div", { class: "fk-empty" }, [`Failed to load: ${(e as Error).message}`]),
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
    const wrap = el("div", { class: "fk-actions" });

    if (interactions.length === 0) {
      // Read-only mode: just show the count (if visible).
      if (showCount) {
        const btn = el("button", { class: "fk-act", type: "button", disabled: "true" }, [
          el("span", {}, [String(f.vote_count)]),
        ]);
        wrap.appendChild(btn);
      }
      return wrap;
    }

    for (const i of interactions) {
      const meta = INTERACTION_META[i];
      const btn = el("button", {
        class: "fk-act",
        type: "button",
        "aria-label": meta.label,
      }, [
        el("span", { class: "fk-glyph" }, [meta.icon]),
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
      body.appendChild(el("div", { class: "fk-empty" }, ["No items yet — be the first!"]));
      return;
    }
    for (const f of features) {
      body.appendChild(renderRow(f));
    }
  }

  // A row collapses by default; clicking the meta column reveals comments.
  function renderRow(f: Feature): HTMLElement {
    const row = el("div", { class: "fk-row" });
    row.appendChild(renderActions(f));

    const meta = el("div", { class: "fk-meta" });
    meta.appendChild(el("div", { class: "fk-item-title" }, [f.title]));
    if (f.description) meta.appendChild(el("div", { class: "fk-item-desc" }, [f.description]));

    const badges = el("div", { class: "fk-item-badges" });
    if (f.status && f.status !== "open") {
      const b = el("span", { class: "fk-badge" }, [f.status.replace("_", " ")]);
      b.setAttribute("data-status", f.status);
      badges.appendChild(b);
    }
    if (f.tag) badges.appendChild(el("span", { class: "fk-badge" }, [f.tag]));
    if (badges.children.length) meta.appendChild(badges);

    let commentsLoaded = false;
    const commentsEl = el("div", { class: "fk-comments" });
    commentsEl.style.display = "none";
    meta.appendChild(commentsEl);

    meta.addEventListener("click", async () => {
      const opening = commentsEl.style.display === "none";
      commentsEl.style.display = opening ? "" : "none";
      if (opening && !commentsLoaded) {
        commentsLoaded = true;
        commentsEl.replaceChildren(el("div", { class: "fk-loading" }, ["Loading…"]));
        try {
          const cs = await client.listComments(f.id);
          commentsEl.replaceChildren(...renderComments(f, cs));
        } catch (e) {
          commentsEl.replaceChildren(
            el("div", { class: "fk-error" }, [(e as Error).message]),
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
      nodes.push(el("div", { class: "fk-empty" }, ["No replies yet."]));
    } else {
      for (const c of comments) {
        nodes.push(el("div", { class: "fk-comment" }, [
          el("span", { class: "fk-comment-author" }, [c.author_name || "Anonymous"]),
          " — ",
          c.body,
        ]));
      }
    }
    // Comment input
    const input = el("textarea", {
      class: "fk-textarea",
      placeholder: "Add a reply…",
      rows: "2",
    }) as HTMLTextAreaElement;
    const send = el("button", { class: "fk-submit", type: "button" }, ["Reply"]) as HTMLButtonElement;
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
    nodes.push(el("div", { class: "fk-reply" }, [input, send]));
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

    const form = el("form", { class: "fk-form" }) as HTMLFormElement;

    const kindLabel = el("label", { class: "fk-label" }, ["What's this about?"]);
    const segmented = el("div", { class: "fk-segmented" });
    const segButtons: HTMLButtonElement[] = [];
    for (const opt of safeOptions) {
      const btn = el("button", { class: "fk-seg", type: "button" }, [opt.label]) as HTMLButtonElement;
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

    const titleLabel = el("label", { class: "fk-label" }, ["Title"]);
    const titleInput = el("input", {
      class: "fk-input",
      type: "text",
      placeholder: safeOptions[0].placeholder,
      required: "true",
    }) as HTMLInputElement;
    titleLabel.appendChild(titleInput);

    const descLabel = el("label", { class: "fk-label fk-grow" }, ["Description"]);
    const descInput = el("textarea", {
      class: "fk-textarea",
      placeholder: "Any extra context helps.",
      rows: "4",
    }) as HTMLTextAreaElement;
    descLabel.appendChild(descInput);

    const submit = el("button", { class: "fk-submit", type: "submit" }, ["Submit"]) as HTMLButtonElement;

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
