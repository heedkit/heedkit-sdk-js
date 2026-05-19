import { FeedbackHubClient, type Feature, type FeedbackHubConfig, type Theme } from "./client";

export type MountOptions = FeedbackHubConfig & {
  /** Floating button label. Default: "Feedback". */
  label?: string;
  /** Hide the floating button (you'll call `widget.open()` yourself). Default: false. */
  hideLauncher?: boolean;
  /** Element to mount the launcher into. Default: document.body. */
  container?: HTMLElement;
};

export type Widget = {
  client: FeedbackHubClient;
  open: () => void;
  close: () => void;
  destroy: () => void;
};

const STYLE_ID = "feedbackhub-styles";

const CSS = `
.fh-launcher {
  position: fixed; bottom: 24px; right: 24px; z-index: 2147483645;
  background: var(--fh-primary); color: #fff; border: 0; border-radius: 999px;
  padding: 12px 18px; font-weight: 600; font-size: 14px; cursor: pointer;
  box-shadow: 0 10px 24px rgba(0,0,0,.18); font-family: var(--fh-font);
  transition: transform .15s ease;
}
.fh-launcher:hover { transform: translateY(-1px); }
.fh-overlay {
  position: fixed; inset: 0; z-index: 2147483646; display: flex;
  align-items: center; justify-content: center; padding: 16px;
  background: rgba(0,0,0,.45); backdrop-filter: blur(2px);
  font-family: var(--fh-font);
}
.fh-panel {
  width: 100%; max-width: 480px; max-height: 85vh; display: flex; flex-direction: column;
  background: var(--fh-bg); color: var(--fh-fg);
  border-radius: calc(var(--fh-radius) * 1.5); overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.3);
}
.fh-head { padding: 20px; border-bottom: 1px solid var(--fh-border); }
.fh-title { font-size: 20px; font-weight: 700; }
.fh-tabs { display: flex; gap: 8px; margin-top: 12px; }
.fh-tab {
  border: 0; background: transparent; padding: 6px 14px; border-radius: 999px;
  font-size: 13px; font-weight: 500; cursor: pointer; color: var(--fh-muted);
}
.fh-tab[data-active="true"] { background: var(--fh-primary); color: #fff; }
.fh-body { flex: 1; overflow-y: auto; padding: 16px; }
.fh-empty { text-align: center; padding: 32px; opacity: .6; font-size: 14px; }
.fh-row {
  display: flex; gap: 12px; padding: 12px; margin-bottom: 8px;
  background: var(--fh-row); border-radius: var(--fh-radius);
}
.fh-vote {
  border: 1px solid var(--fh-border); background: transparent;
  color: var(--fh-fg); border-radius: calc(var(--fh-radius) - 2px);
  padding: 6px 10px; cursor: pointer; min-width: 44px;
  display: flex; flex-direction: column; align-items: center;
  font-weight: 600; font-size: 13px;
}
.fh-vote[data-voted="true"] {
  border: 2px solid var(--fh-primary);
  background: color-mix(in srgb, var(--fh-primary) 14%, transparent);
  color: var(--fh-primary);
}
.fh-vote .fh-arrow { font-size: 14px; line-height: 1; }
.fh-item-title { font-weight: 600; font-size: 14px; }
.fh-item-desc { opacity: .65; font-size: 12px; margin-top: 4px; }
.fh-form { display: flex; flex-direction: column; gap: 12px; }
.fh-label { font-size: 13px; font-weight: 500; }
.fh-input, .fh-textarea {
  width: 100%; padding: 10px 12px; margin-top: 4px;
  border-radius: calc(var(--fh-radius) - 2px);
  border: 1px solid var(--fh-input-border); background: var(--fh-input-bg);
  color: var(--fh-fg); font-size: 14px; font-family: inherit;
  box-sizing: border-box;
}
.fh-textarea { resize: vertical; min-height: 96px; }
.fh-input:focus, .fh-textarea:focus { outline: 2px solid var(--fh-primary); outline-offset: 1px; }
.fh-submit {
  background: var(--fh-primary); color: #fff; border: 0;
  padding: 12px 14px; border-radius: var(--fh-radius);
  font-weight: 600; font-size: 14px; cursor: pointer;
}
.fh-submit[disabled] { opacity: .6; cursor: not-allowed; }
.fh-loading { text-align: center; padding: 32px; opacity: .6; }
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function applyTheme(root: HTMLElement, theme: Theme) {
  const primary = theme.primary || "#0D9488";
  const radius = `${theme.radius ?? 12}px`;
  const dark = theme.mode === "dark";
  const vars: Record<string, string> = {
    "--fh-primary": primary,
    "--fh-radius": radius,
    "--fh-font": theme.fontFamily || "system-ui, -apple-system, sans-serif",
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

export function mount(options: MountOptions): Widget {
  injectStyles();

  const container = options.container || document.body;
  const client = new FeedbackHubClient(options);

  // Eagerly init so theme is available
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

function renderPanel(
  client: FeedbackHubClient,
  theme: Theme,
  onClose: () => void
): HTMLDivElement {
  const overlay = el("div", { class: "fh-overlay", role: "dialog" }) as HTMLDivElement;
  applyTheme(overlay, theme);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) onClose();
  });

  const panel = el("div", { class: "fh-panel" });
  overlay.appendChild(panel);

  // Header
  const head = el("div", { class: "fh-head" });
  head.appendChild(el("div", { class: "fh-title" }, [
    client.getProjectName() || "Feedback",
  ]));

  const tabs = el("div", { class: "fh-tabs" });
  const tabList = el("button", { class: "fh-tab", type: "button" }, ["Top requests"]);
  const tabNew = el("button", { class: "fh-tab", type: "button" }, ["Suggest"]);
  tabs.append(tabList, tabNew);
  head.appendChild(tabs);
  panel.appendChild(head);

  const body = el("div", { class: "fh-body" });
  panel.appendChild(body);

  let features: Feature[] = [];
  let active: "list" | "new" = "list";

  function setActive(which: "list" | "new") {
    active = which;
    tabList.setAttribute("data-active", String(which === "list"));
    tabNew.setAttribute("data-active", String(which === "new"));
    render();
  }

  async function refresh() {
    body.replaceChildren(el("div", { class: "fh-loading" }, ["Loading…"]));
    try {
      features = await client.list({ sort: "top" });
    } catch (e) {
      body.replaceChildren(
        el("div", { class: "fh-empty" }, [`Failed to load: ${(e as Error).message}`])
      );
      return;
    }
    render();
  }

  async function toggleVote(f: Feature) {
    const r = await client.vote(f.id);
    f.voted = r.voted;
    f.vote_count = r.vote_count;
    render();
  }

  function renderList() {
    body.innerHTML = "";
    if (features.length === 0) {
      body.appendChild(el("div", { class: "fh-empty" }, ["No requests yet — be the first!"]));
      return;
    }
    for (const f of features) {
      const row = el("div", { class: "fh-row" });
      const vote = el("button", { class: "fh-vote", type: "button" }, [
        el("span", { class: "fh-arrow" }, ["▲"]),
        el("span", {}, [String(f.vote_count)]),
      ]) as HTMLButtonElement;
      vote.setAttribute("data-voted", String(f.voted));
      vote.addEventListener("click", () => toggleVote(f));

      const meta = el("div", { style: "flex:1;min-width:0" });
      meta.appendChild(el("div", { class: "fh-item-title" }, [f.title]));
      if (f.description) {
        meta.appendChild(el("div", { class: "fh-item-desc" }, [f.description]));
      }

      row.append(vote, meta);
      body.appendChild(row);
    }
  }

  function renderForm() {
    body.innerHTML = "";
    const form = el("form", { class: "fh-form" }) as HTMLFormElement;

    const titleLabel = el("label", { class: "fh-label" }, ["Title"]);
    const titleInput = el("input", {
      class: "fh-input",
      type: "text",
      placeholder: "Short, descriptive title",
      required: "true",
    }) as HTMLInputElement;
    titleLabel.appendChild(titleInput);

    const descLabel = el("label", { class: "fh-label" }, ["Description"]);
    const descInput = el("textarea", {
      class: "fh-textarea",
      placeholder: "What problem does this solve?",
      rows: "4",
    }) as HTMLTextAreaElement;
    descLabel.appendChild(descInput);

    const submit = el("button", { class: "fh-submit", type: "submit" }, [
      "Submit feedback",
    ]) as HTMLButtonElement;

    form.append(titleLabel, descLabel, submit);
    body.appendChild(form);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!titleInput.value.trim()) return;
      submit.disabled = true;
      submit.textContent = "Submitting…";
      try {
        await client.submit({ title: titleInput.value, description: descInput.value });
        titleInput.value = "";
        descInput.value = "";
        setActive("list");
        await refresh();
      } catch (err) {
        submit.disabled = false;
        submit.textContent = "Submit feedback";
        alert((err as Error).message);
      }
    });
  }

  function render() {
    if (active === "list") renderList();
    else renderForm();
  }

  tabList.addEventListener("click", () => setActive("list"));
  tabNew.addEventListener("click", () => setActive("new"));

  setActive("list");
  refresh();

  return overlay;
}
