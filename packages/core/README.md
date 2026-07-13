# @heedkit/sdk-js

The official JavaScript/TypeScript SDK for [HeedKit](https://heedkit.com) — drop a
feedback widget into any web app so your users can submit feature requests, vote, and
comment, and you get a public roadmap and changelog out of the box.

One package covers every web framework: the vanilla core plus **React**, **Vue**, and
**Angular** bindings shipped as subpath exports.

- 🟦 Written in TypeScript — full types included
- 🪶 Zero runtime dependencies (frameworks are optional peer deps)
- 🧩 Works with a `<script>` tag, a bundler, or any framework
- 🔒 Signed identity so submissions are attributed to *your* users

```bash
npm i @heedkit/sdk-js
```

> Looking for React Native? It's a separate package:
> [`@heedkit/sdk-react-native`](https://www.npmjs.com/package/@heedkit/sdk-react-native).

---

## Quick start

You need two things from your HeedKit project's **Integrations** page:

- **`projectKey`** — your public key, e.g. `fk_xxx` (safe to ship to the browser).
- **`apiUrl`** — your API base, e.g. `https://heedkit.com` (origin only — the SDK appends `/sdk/...`).

### Vanilla JS — drop-in widget

`mount()` renders a floating feedback launcher into `document.body`:

```ts
import { mount } from "@heedkit/sdk-js";

const widget = mount({
  projectKey: "fk_xxx",
  apiUrl: "https://heedkit.com",
  user: { externalId: "user-123", email: "ada@example.com" },
  label: "Feedback",      // launcher text (default: "Feedback")
});

// Control it imperatively:
widget.open();
widget.close();
widget.destroy();         // remove it entirely
```

### `<script>` tag (no build step)

A single IIFE bundle exposes `window.HeedKit`:

```html
<script src="https://unpkg.com/@heedkit/sdk-js"></script>
<script>
  HeedKit.mount({ projectKey: "fk_xxx", apiUrl: "https://heedkit.com" });
</script>
```

---

## Frameworks (subpath imports)

Install the one package; import the binding for your framework.

### React — `@heedkit/sdk-js/react`

```tsx
import { HeedKitProvider, FeedbackButton, useHeedKit } from "@heedkit/sdk-js/react";

function App() {
  return (
    <HeedKitProvider
      projectKey="fk_xxx"
      apiUrl="https://heedkit.com"
      user={{ externalId: "user-123" }}
    >
      <FeedbackButton label="Feedback" />
      {/* ...your app... */}
    </HeedKitProvider>
  );
}

// Need the underlying client for custom UI?
function CustomTrigger() {
  const { client, ready } = useHeedKit();
  // client.list(), client.submit(), ...
}
```

### Vue 3 — `@heedkit/sdk-js/vue`

```ts
import { createApp } from "vue";
import { createHeedKit } from "@heedkit/sdk-js/vue";
import App from "./App.vue";

createApp(App)
  .use(createHeedKit({ projectKey: "fk_xxx", apiUrl: "https://heedkit.com" }))
  .mount("#app");
```

```vue
<script setup lang="ts">
import { FeedbackButton } from "@heedkit/sdk-js/vue";
</script>

<template>
  <FeedbackButton label="Feedback" />
</template>
```

### Angular — `@heedkit/sdk-js/angular`

```ts
import { bootstrapApplication } from "@angular/platform-browser";
import { provideHeedKit } from "@heedkit/sdk-js/angular";
import { AppComponent } from "./app.component";

bootstrapApplication(AppComponent, {
  providers: [
    provideHeedKit({ projectKey: "fk_xxx", apiUrl: "https://heedkit.com" }),
  ],
});
```

```ts
import { Component } from "@angular/core";
import { FeedbackButtonComponent } from "@heedkit/sdk-js/angular";

@Component({
  standalone: true,
  imports: [FeedbackButtonComponent],
  template: `<heedkit-button label="Feedback" />`,
})
export class AppComponent {}
```

---

## Identifying your users (recommended)

Passing a `user` attributes feedback to a real person. A named identity must be
**signed by your backend** — the API rejects any `externalId` that arrives without a
valid `userHash` (`401 invalid_user_signature`). Never compute the hash in the browser;
the project *secret* stays server-side.

```ts
// On YOUR backend (authenticated route):
//   userHash = lowercase_hex( HMAC_SHA256(projectSecret, externalId) )
//   e.g. GET /heedkit/identity -> { externalId, userHash, name, email }

const me = await (await fetch("/heedkit/identity")).json();
const fk = new HeedKitClient({ projectKey: "fk_xxx", apiUrl: "https://heedkit.com" });
await fk.init({ externalId: me.externalId, userHash: me.userHash, email: me.email });
```

Self-check your backend hash: secret `fk_secret_test_0123456789abcdef` + externalId
`user-42` must produce
`4c630c032f4ff66a3e6379eca16cfc5fc40b231d6aeb1cd34c155efd3db54e7d`.

Anonymous usage also works — omit `user` (or just `externalId`) and an anonymous
end-user is created; its server-issued identity token is remembered via `localStorage`
so votes stick to the same visitor across page loads.

---

## Client API

For custom UIs, use `HeedKitClient` directly (it's what the widget and framework
bindings wrap):

```ts
import { HeedKitClient } from "@heedkit/sdk-js";

const fk = new HeedKitClient({ projectKey: "fk_xxx", apiUrl: "https://heedkit.com" });
await fk.init({ externalId: "user-123" });
```

| Method | Description |
|---|---|
| `init(user?)` | Identify (find-or-create) the end-user; returns project config + identity. Call first. |
| `list({ status?, kind?, sort?, cursor? })` | List features (public + the caller's own private), cursor-paginated. |
| `submit({ title, description?, kind?, tag? })` | Submit a feature request as the end-user. |
| `vote(featureId)` | Toggle the end-user's vote. Returns `{ voted, vote_count }`. |
| `listComments(featureId)` | List a feature's public comments. |
| `comment(featureId, body)` | Add a comment as the end-user. |
| `getTheme()` / `getProjectName()` / `getEnabledKinds()` / `getEndUserId()` … | Read project config resolved during `init()`. |

### Configuration

```ts
type HeedKitConfig = {
  projectKey: string;   // your public key (fk_...)
  apiUrl?: string;      // API base; defaults to https://api.heedkit.com
  user?: EndUser;       // optional identity
};

type EndUser = {
  externalId?: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  platform?: string;
};

// mount() also accepts:
type MountOptions = HeedKitConfig & {
  label?: string;         // launcher label (default "Feedback")
  hideLauncher?: boolean; // hide the floating button; call widget.open() yourself
  container?: HTMLElement; // custom mount target
};
```

> **`apiUrl` gotcha:** pass your HeedKit **origin**, without `/sdk` — the SDK appends `/sdk/...` itself, so `https://heedkit.com/sdk` double-stacks the path (`/sdk/sdk/init` → 404). Always set it explicitly (e.g. `https://heedkit.com`); the default (`https://api.heedkit.com`) doesn't currently serve the API.

---

## TypeScript

Types ship with the package for every entry point (`.`, `/react`, `/vue`, `/angular`).
No `@types/*` needed.

## Links

- **Docs & dashboard:** [heedkit.com](https://heedkit.com)
- **Source:** [github.com/heedkit/heedkit-sdk-js](https://github.com/heedkit/heedkit-sdk-js)
- **React Native SDK:** [`@heedkit/sdk-react-native`](https://www.npmjs.com/package/@heedkit/sdk-react-native)

## License

MIT © HeedKit
