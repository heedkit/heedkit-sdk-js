# HeedKit SDK — vanilla TypeScript example

A small Vite + vanilla-TS browser demo that drives the full HeedKit flow
against the Rails `/sdk` backend using **this repo's SDK source** (imported
from `../src`, not a published package).

It demonstrates:

1. Configure the SDK with a workspace key + Rails endpoint.
2. Init / identify an end-user — `client.init(...)` → `POST /sdk/init`.
3. Fetch & display the roadmap/feedback list — `client.list(...)` → `GET /sdk/features`.
4. Submit a new feature — `client.submit(...)` → `POST /sdk/features`.
5. Upvote a feature (toggle) — `client.vote(id)` → `POST /sdk/features/:id/vote`.
6. List & add comments — `client.listComments(id)` / `client.comment(id, body)`.

All calls go through `HeedKitClient` (see `../src/client.ts`); no SDK API is
invented and nothing here calls the Rails endpoints directly.

## Prerequisites

1. **Run the Rails backend** (separate repo/folder, `heedkit-rails`):

   ```bash
   cd heedkit-rails
   bin/dev          # serves on port 3000
   ```

2. **Get a workspace key.** Open the HeedKit console **Install** page, or use
   the key seeded by `db/seeds` for the demo `heedkit` / `demo` workspace.
   It looks like `pk_...`. Never hardcode a real key into committed files.

## Configure

Either edit the `CONFIG` constant at the top of `main.ts`, or create a
`.env.local` (copy from `.env.example`):

```bash
cp .env.example .env.local
# then set VITE_HEEDKIT_WORKSPACE_KEY=pk_your_key
```

| Var | Default | Notes |
| --- | --- | --- |
| `VITE_HEEDKIT_WORKSPACE_KEY` | `pk_REPLACE_ME` | Public workspace key. |
| `VITE_HEEDKIT_API_URL` | `http://heedkit.localhost:3000` | Bare origin; the SDK appends `/sdk`. |

## Run

```bash
npm install
npm run dev
# open the printed URL (http://localhost:5173)
```

`X-Workspace-Key` is attached to every request by the SDK. CORS is open on the
Rails side, so the browser demo works cross-origin.

## Endpoint / host notes

The SDK's `apiUrl` is the **bare origin** — `client.request()` appends `/sdk`
to it. Pick the host that matches where your code runs:

| Where the code runs | `apiUrl` |
| --- | --- |
| Browser (this demo, dev) | `http://heedkit.localhost:3000` |
| Non-browser / native (Node, curl) | `http://127.0.0.1:3000` |
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://localhost:3000` |

The Rails apex route matches any `Host`, so `heedkit.localhost` and
`127.0.0.1` both resolve to the same dev server.

## How it imports the SDK

`main.ts` imports straight from source:

```ts
import { HeedKitClient, type Feature } from "../src";
```

Vite compiles the TypeScript on the fly — there is **no separate SDK build
step**. `vite.config.ts` widens `server.fs.allow` to `..` so the dev server may
read files in the parent (the SDK source).

> Prefer the prebuilt widget? The SDK also ships `mount()` (a floating launcher
> + themed panel). See the root `README.md`. This example uses the lower-level
> `HeedKitClient` so each step of the flow is explicit.
