# @featurekit/sdk-js

Zero-dependency JavaScript SDK for Feature Kit. Works in any browser, with any framework, or none at all.

## Install

### npm

```bash
npm i @featurekit/sdk-js
```

```ts
import { mount } from "@featurekit/sdk-js";

mount({
  projectKey: "fh_xxx",
  user: { externalId: "user-123", email: "you@app.com" },
});
```

### `<script>` tag (no build step)

```html
<script src="https://cdn.jsdelivr.net/npm/@featurekit/sdk-js/dist/featurekit.iife.js"></script>
<script>
  FeatureKit.mount({
    projectKey: "fh_xxx",
    user: { externalId: "user-123" },
  });
</script>
```

That's it — a floating "Feedback" button appears in the bottom-right and opens a themed panel.

## Options

```ts
mount({
  projectKey: "fh_xxx",      // required
  apiUrl: "https://...",     // optional, defaults to cloud
  user: { externalId, email, name, avatarUrl, platform },
  label: "Send feedback",    // launcher button label
  hideLauncher: false,       // hide the FAB and call widget.open() yourself
  container: document.body,  // where to mount the launcher
});
```

## Manual control

```ts
const widget = mount({ projectKey: "fh_xxx", hideLauncher: true });

document.querySelector("#my-button")!.addEventListener("click", () => {
  widget.open();
});

// Programmatic access:
const features = await widget.client.list({ sort: "top" });
await widget.client.vote(featureId);
await widget.client.submit({ title: "Dark mode", description: "..." });
```

## Headless (no built-in UI)

If you want to use the API client without the widget UI:

```ts
import { FeatureKitClient } from "@featurekit/sdk-js";

const client = new FeatureKitClient({ projectKey: "fh_xxx" });
await client.init({ externalId: "user-123" });
const features = await client.list();
```
