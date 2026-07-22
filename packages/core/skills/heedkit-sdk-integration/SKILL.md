---
name: heedkit-sdk-integration
description: Use when adding the HeedKit feedback widget (feature requests, voting, comments, public roadmap/changelog) to a web app — vanilla JS, React, Vue, or Angular. Covers install, choosing the right entry point, wiring the widget, and identifying users securely.
---

# Integrating @heedkit/sdk-js

HeedKit is a feedback / feature-request / public-roadmap tool. This one npm package,
`@heedkit/sdk-js`, drops a feedback widget into any web app. Framework bindings ship as
**subpath exports** (`/react`, `/vue`, `/angular`) — install one package regardless of
framework.

> React Native is a **separate** package: `@heedkit/sdk-react-native`. Do not try to use
> `@heedkit/sdk-js` in a React Native app.

## Before you start — collect two values

From the user's HeedKit workspace **Integrations** page:

1. **`workspaceKey`** — public key, format `fk_...`. Safe to ship to the browser.
2. **`apiUrl`** — the API base, e.g. `https://heedkit.com` (origin only — the SDK appends `/sdk/...`).

⚠️ **`apiUrl` gotcha:** pass the HeedKit **origin only, never an `/sdk`-suffixed URL** —
the SDK appends `/sdk/...` to it, so `apiUrl: "https://heedkit.com/sdk"` requests
`/sdk/sdk/init` and every call 404s. And **always pass it explicitly**: the built-in
default (`https://api.heedkit.com`) doesn't currently serve the API, so omitting it makes
the widget silently fail to load. Correct value for HeedKit cloud: `https://heedkit.com`.

## Step 1 — install

```bash
npm i @heedkit/sdk-js
```

## Step 2 — pick the entry point for the app's framework

Detect the framework (package.json deps) and use the matching subpath. Do NOT import from
`@heedkit/sdk-react` / `-vue` / `-angular` — those old packages are deprecated; everything
is under `@heedkit/sdk-js/*` now.

| App | Import from | Wire-up |
|---|---|---|
| Vanilla / any | `@heedkit/sdk-js` | call `mount(...)` |
| React | `@heedkit/sdk-js/react` | wrap in `<HeedKitProvider>`, drop `<FeedbackButton/>` |
| Vue 3 | `@heedkit/sdk-js/vue` | `app.use(createHeedKit(...))`, use `<FeedbackButton/>` |
| Angular | `@heedkit/sdk-js/angular` | `provideHeedKit(...)`, use `<heedkit-button/>` |

## Step 3 — wire it up

**Vanilla** — `mount()` injects a floating launcher into `document.body`:
```ts
import { mount } from "@heedkit/sdk-js";
const widget = mount({ workspaceKey: "fk_xxx", apiUrl: "https://heedkit.com" });
// widget.open() / widget.close() / widget.destroy()
```

**React:**
```tsx
import { HeedKitProvider, FeedbackButton } from "@heedkit/sdk-js/react";
<HeedKitProvider workspaceKey="fk_xxx" apiUrl="https://heedkit.com">
  <FeedbackButton label="Feedback" />
</HeedKitProvider>
```

**Vue 3:**
```ts
import { createHeedKit } from "@heedkit/sdk-js/vue";
app.use(createHeedKit({ workspaceKey: "fk_xxx", apiUrl: "https://heedkit.com" }));
// template: <FeedbackButton label="Feedback" />  (import from @heedkit/sdk-js/vue)
```

**Angular:**
```ts
import { provideHeedKit } from "@heedkit/sdk-js/angular";
bootstrapApplication(AppComponent, { providers: [
  provideHeedKit({ workspaceKey: "fk_xxx", apiUrl: "https://heedkit.com" }),
]});
// template: <heedkit-button label="Feedback" />  (import FeedbackButtonComponent)
```

**`<script>` tag (no bundler):** `window.HeedKit` from the CDN bundle:
```html
<script src="https://unpkg.com/@heedkit/sdk-js"></script>
<script>HeedKit.mount({ workspaceKey: "fk_xxx", apiUrl: "https://heedkit.com" });</script>
```

## Step 4 — identify the user (recommended, not required)

Pass a `user` so feedback is attributed to a real person. A named identity MUST be signed
by the app's backend — the API rejects any `externalId` without a valid `userHash`
(`401 invalid_user_signature`).

1. **Backend** (authenticated route, e.g. `GET /heedkit/identity`):
   `userHash = lowercase_hex(HMAC_SHA256(key = serverSecret, message = String(session.user.id)))`
   → respond `{ externalId, userHash, name, email }`. Sign ONLY the session user's id —
   never an id taken from request params.
   Self-check: secret `fk_secret_test_0123456789abcdef` + externalId `user-42` must give
   `4c630c032f4ff66a3e6379eca16cfc5fc40b231d6aeb1cd34c155efd3db54e7d`.
2. **Frontend**: fetch that payload and pass it as the `user`:

```ts
const me = await (await fetch("/heedkit/identity")).json();
await fk.init({ externalId: me.externalId, userHash: me.userHash, name: me.name, email: me.email });
// or user={...same fields...} on HeedKitProvider / mount()
```

Omit `user` entirely for anonymous feedback — an anonymous end-user is created and its
server-issued identity token is remembered via `localStorage`. Do NOT invent a device id
as `externalId` for anonymous users; unsigned ids are rejected.

**Never** put the workspace *secret* in client code. If you find yourself hardcoding a secret
in the frontend, stop — the hash must be computed server-side.

Requires `@heedkit/sdk-js` >= 0.3.0 (`userHash` support). On 0.2.x, call the wire API
directly instead: `POST <apiUrl>/init` with `{external_id, user_hash, name, email}`, then
replay the returned `identity` as the `X-HeedKit-Identity` header on later `/sdk/*` calls.

## Custom UI (skip the built-in widget)

Use `HeedKitClient` directly:
```ts
import { HeedKitClient } from "@heedkit/sdk-js";
const fk = new HeedKitClient({ workspaceKey: "fk_xxx", apiUrl: "https://heedkit.com" });
await fk.init({ externalId: "user-123" });        // call first
await fk.list({ status?, kind?, sort? });          // features (kind: feature_request|bug_report|improvement|appreciation|other; sort: top|new)
await fk.submit({ title, description?, kind?, tag? });
await fk.vote(featureId);                           // -> { voted, vote_count }
await fk.listComments(featureId);
await fk.comment(featureId, body);
```
`init()` must run before any other call (they throw otherwise).

## Verify

- Load the app; the feedback launcher should appear (bottom corner) and open a panel.
- If nothing shows: 90% of the time it's a wrong/missing `apiUrl` or `workspaceKey`. Check the
  network tab for a failing request to `<apiUrl>/sdk/init` and fix the base URL.
- TypeScript types ship for every entry point — no `@types/*` needed.
