# heedkit-sdk-js — Guide for Claude Code

**Monorepo** (pnpm workspace) for HeedKit's web SDKs: one framework-agnostic TypeScript
**core** plus thin framework **adapters** that depend on it. The client, `/sdk/*` API
contract, HMAC identity, and floating widget live in `@heedkit/sdk-js` exactly once — the
adapters import it, they don't vendor copies.

> History note: this repo used to be just the single `@heedkit/sdk-js` package. It absorbed
> the former `heedkit-sdk-react` / `-vue` / `-angular` / `-react-native` repos as
> `packages/*` (the core's git history is preserved via `git mv` into `packages/core/`).

## Packages

| Dir | npm | Bundler | Notes |
|---|---|---|---|
| `packages/core` | `@heedkit/sdk-js` | tsup (+ IIFE CDN build → `heedkit.iife.js`) | core **+** the React/Vue/Angular bindings as **subpath exports** |
| `packages/react-native` | `@heedkit/sdk-react-native` | react-native-builder-bob | separate package (native UI); `workspace:*` dep on the core |

The React/Vue/Angular SDKs are **NOT separate packages** — they ship from the single
`@heedkit/sdk-js` package via subpaths, so consumers `npm i @heedkit/sdk-js` once:
```ts
import { HeedKit, mount } from "@heedkit/sdk-js";          // core / vanilla
import { HeedKitProvider, useHeedKit } from "@heedkit/sdk-js/react";
import { createHeedKit } from "@heedkit/sdk-js/vue";
import { provideHeedKit, HeedKitService } from "@heedkit/sdk-js/angular";
```
Frameworks are **optional peer deps** (`peerDependenciesMeta … optional`), so a plain-JS user
isn't forced to install react/vue/angular. React Native stays its own package because it's a
substantial native-UI reimplementation, not a thin binding — it only reuses the core client.

## Core source (`packages/core/src/`)
- `client.ts` — HTTP + HeedKit `/sdk/*` API + HMAC identity/replay token (the core contract).
- `widget.ts` — floating widget, built via `innerHTML` strings; **preserve escaping, it's an
  XSS surface**.
- `index.ts` — public barrel (must re-export everything the framework wrappers use; e.g.
  `WorkspaceConfig` had to be added here). This is the `@heedkit/sdk-js` entry.
- `react.tsx` — the `/react` entry (`HeedKitProvider`, `useHeedKit`, `FeedbackButton`).
- `vue/` — the `/vue` entry (`createHeedKit` plugin + `FeedbackButton`; the SFC was converted
  to a `defineComponent` .ts so one tsup pass builds everything — no vite needed).
- `angular/` — the `/angular` entry (`provideHeedKit`, `HeedKitService`,
  `FeedbackButtonComponent`; standalone component with `template: ""`, so tsup/esbuild builds
  it with `experimentalDecorators` — no ng-packagr).
- `Example/` — a plain consumer app wired to the Rails `/sdk` backend.

Build gotchas baked into `tsup.config.ts` + `tsconfig.json`: multi-entry (index/react/vue/
angular), `jsx: automatic` for react.tsx, `experimentalDecorators` for Angular, and the
frameworks marked `external` so they're never bundled.

## Commands (pnpm — NOT npm)
```bash
pnpm install
pnpm build       # all packages; core first (adapters depend on it)
pnpm test        # core has the client contract suite (16 tests); adapters pass-with-no-tests
pnpm typecheck
```

## Release (changesets)
```bash
pnpm changeset          # describe change + pick semver bumps
pnpm version            # apply bumps, rewrite workspace:* → real versions
pnpm release            # build, then publish core-before-adapters
```
`updateInternalDependencies: patch` auto-bumps adapters when core changes, so core never
ships without the adapters that reference it. (Old repo published via `npm publish` +
`prepublishOnly`; that metadata now lives on `packages/core/package.json`.)

## Contract
`POST /sdk/init` with an HMAC-signed `external_id`, then a `MessageVerifier` replay token in
`X-HeedKit-Identity` on every call. Duplicated across ALL HeedKit SDKs (native ones too, in
other languages) — keep in sync with `heedkit-rails` (§7 of its CLAUDE.md). See `../CLAUDE.md`
for the full monorepo map.
