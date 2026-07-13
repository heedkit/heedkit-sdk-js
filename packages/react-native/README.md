# @heedkit/sdk-react-native

The official **React Native** SDK for [HeedKit](https://heedkit.com) — add an in-app
feedback experience so your users can submit feature requests, vote, and comment, backed by
your public roadmap and changelog.

Unlike a web wrapper, this is a **native UI** built from React Native primitives (`Modal`,
`View`, `Pressable`, …) — it renders properly in your app, adapts to light/dark, and picks up
your project's theme. It reuses the shared HeedKit client for data/identity.

- 🟦 TypeScript — full types included
- 📱 Native components, not a WebView
- 🌓 Follows the device color scheme + your HeedKit theme

```bash
npm i @heedkit/sdk-react-native
# peers you likely already have:
npm i react react-native
```

## Quick start

You need two values from your HeedKit project's **Integrations** page:

- **`projectKey`** — your public key, `fk_...` (safe on the client).
- **`apiUrl`** — your API base, e.g. `https://heedkit.com` (origin only — the SDK appends `/sdk/...`).

Wrap your app in `HeedKitProvider`, then drop in `<FeedbackButton />`:

```tsx
import { HeedKitProvider, FeedbackButton } from "@heedkit/sdk-react-native";

export default function App() {
  return (
    <HeedKitProvider
      projectKey="fk_xxx"
      apiUrl="https://heedkit.com"
      user={{ externalId: "user-123", email: "ada@example.com" }}
    >
      {/* ...your app... */}
      <FeedbackButton label="Feedback" />
    </HeedKitProvider>
  );
}
```

`<FeedbackButton />` renders a floating pill that opens the full feedback UI in a slide-up
modal. That's the whole integration.

> **`apiUrl` gotcha:** pass your HeedKit **origin**, without `/sdk` — the SDK appends `/sdk/...` itself, so `https://heedkit.com/sdk` double-stacks the path (`/sdk/sdk/init` → 404). Always set it explicitly (e.g. `https://heedkit.com`); the default (`https://api.heedkit.com`) doesn't currently serve the API.

## Components

### `<HeedKitProvider>`

Initializes the client and provides it to the tree. Props are `projectKey`, `apiUrl?`,
`user?` (see [Identity](#identifying-your-users)), plus `children`. `platform` is set to
`"react-native"` automatically.

### `<FeedbackButton label?>`

A floating action button that presents `<FeedbackScreen>` in a `Modal`. Renders nothing until
the provider is ready. Default `label` is `"Feedback"`.

### `<FeedbackScreen onClose?>`

The full feedback experience (browse features by kind, vote, comment, and suggest new ones).
Use this directly when you want feedback as its own route/tab instead of a floating button —
e.g. inside your navigator:

```tsx
import { FeedbackScreen } from "@heedkit/sdk-react-native";

function FeedbackTab() {
  return <FeedbackScreen />;
}
```

### `useHeedKit()`

Access the underlying client for custom UI. Returns `{ client, ready, theme }`:

```tsx
import { useHeedKit } from "@heedkit/sdk-react-native";

function MyComponent() {
  const { client, ready } = useHeedKit();
  // await client.list({ status, kind, sort });
  // await client.submit({ title, description });
  // await client.vote(featureId);
}
```

## Identifying your users

Passing a `user` attributes feedback to a real person. To bind the identity **securely**,
compute an HMAC on your **backend** and pass it as `userHash` — never put your project
*secret* in the app:

```tsx
// userHash = HMAC_SHA256(projectSecret, externalId), computed server-side.
<HeedKitProvider
  projectKey="fk_xxx"
  apiUrl="https://heedkit.com"
  user={{ externalId: "user-123", email: "ada@example.com" /*, userHash */ }}
>
```

Omit `user` for anonymous feedback — an anonymous end-user is created and remembered.

## Client API

The SDK re-exports `HeedKitClient` and all types from
[`@heedkit/sdk-js`](https://www.npmjs.com/package/@heedkit/sdk-js). After `init()`:

| Method | Description |
|---|---|
| `list({ status?, kind?, sort? })` | List features (`kind`: `feature_request` \| `bug_report` \| `improvement` \| `appreciation` \| `other`; `sort`: `top` \| `new`). |
| `submit({ title, description?, kind?, tag? })` | Submit a feature request. |
| `vote(featureId)` | Toggle a vote → `{ voted, vote_count }`. |
| `listComments(featureId)` / `comment(featureId, body)` | Read / add comments. |

## Links

- **Docs & dashboard:** [heedkit.com](https://heedkit.com)
- **Source:** [github.com/heedkit/heedkit-sdk-js](https://github.com/heedkit/heedkit-sdk-js)
- **Web SDK (React/Vue/Angular/vanilla):** [`@heedkit/sdk-js`](https://www.npmjs.com/package/@heedkit/sdk-js)

## License

MIT © HeedKit
