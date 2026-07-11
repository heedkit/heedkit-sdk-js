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

From the user's HeedKit project **Integrations** page:

1. **`projectKey`** — public key, format `fk_...`. Safe to ship to the browser.
2. **`apiUrl`** — the API base, e.g. `https://heedkit.com/sdk`.

⚠️ **`apiUrl` gotcha:** if omitted, the SDK defaults to `https://api.heedkit.com`. Most
deployments serve the API at `https://<host>/sdk` instead — **always pass `apiUrl`
explicitly** unless you've confirmed the default matches. Getting this wrong makes every
call fail silently (the widget just won't load).

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
const widget = mount({ projectKey: "fk_xxx", apiUrl: "https://heedkit.com/sdk" });
// widget.open() / widget.close() / widget.destroy()
```

**React:**
```tsx
import { HeedKitProvider, FeedbackButton } from "@heedkit/sdk-js/react";
<HeedKitProvider projectKey="fk_xxx" apiUrl="https://heedkit.com/sdk">
  <FeedbackButton label="Feedback" />
</HeedKitProvider>
```

**Vue 3:**
```ts
import { createHeedKit } from "@heedkit/sdk-js/vue";
app.use(createHeedKit({ projectKey: "fk_xxx", apiUrl: "https://heedkit.com/sdk" }));
// template: <FeedbackButton label="Feedback" />  (import from @heedkit/sdk-js/vue)
```

**Angular:**
```ts
import { provideHeedKit } from "@heedkit/sdk-js/angular";
bootstrapApplication(AppComponent, { providers: [
  provideHeedKit({ projectKey: "fk_xxx", apiUrl: "https://heedkit.com/sdk" }),
]});
// template: <heedkit-button label="Feedback" />  (import FeedbackButtonComponent)
```

**`<script>` tag (no bundler):** `window.HeedKit` from the CDN bundle:
```html
<script src="https://unpkg.com/@heedkit/sdk-js"></script>
<script>HeedKit.mount({ projectKey: "fk_xxx", apiUrl: "https://heedkit.com/sdk" });</script>
```

## Step 4 — identify the user (recommended, not required)

Pass a `user` so feedback is attributed to a real person. To bind the identity **securely**,
compute an HMAC on the **backend** and pass it as `userHash`:

```ts
// SERVER-SIDE ONLY: userHash = HMAC_SHA256(projectSecret, externalId)
// The project SECRET must never reach the browser. Expose only projectKey + the computed hash.
```
Then include it in the config's `user` (with `externalId`, `email`, etc.). Omit `user`
entirely for anonymous feedback — an anonymous end-user is created and remembered via
`localStorage`.

**Never** put the project *secret* in client code. If you find yourself hardcoding a secret
in the frontend, stop — the hash must be computed server-side.

## Custom UI (skip the built-in widget)

Use `HeedKitClient` directly:
```ts
import { HeedKitClient } from "@heedkit/sdk-js";
const fk = new HeedKitClient({ projectKey: "fk_xxx", apiUrl: "https://heedkit.com/sdk" });
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
- If nothing shows: 90% of the time it's a wrong/missing `apiUrl` or `projectKey`. Check the
  network tab for a failing request to `<apiUrl>/sdk/init` and fix the base URL.
- TypeScript types ship for every entry point — no `@types/*` needed.
