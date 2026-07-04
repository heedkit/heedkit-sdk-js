# heedkit-sdk-js — Guide for Claude Code

**Monorepo** (pnpm workspace) for HeedKit's web SDKs: one framework-agnostic TypeScript
**core** plus thin framework **adapters** that depend on it. The client, `/sdk/*` API
contract, HMAC identity, and floating widget live in `@heedkit/sdk-js` exactly once — the
adapters import it, they don't vendor copies.

> History note: this repo used to be just the single `@heedkit/sdk-js` package. It absorbed
> the former `heedkit-sdk-react` / `-vue` / `-angular` / `-react-native` repos as
> `packages/*` (the core's git history is preserved via `git mv` into `packages/core/`).

## Packages

| Dir | npm | Bundler | Depends on |
|---|---|---|---|
| `packages/core` | `@heedkit/sdk-js` | tsup (+ IIFE CDN build → `heedkit.iife.js`) | — |
| `packages/react` | `@heedkit/sdk-react` | tsup | `@heedkit/sdk-js` |
| `packages/vue` | `@heedkit/sdk-vue` | vite | `@heedkit/sdk-js` |
| `packages/angular` | `@heedkit/sdk-angular` | ng-packagr | `@heedkit/sdk-js` |
| `packages/react-native` | `@heedkit/sdk-react-native` | react-native-builder-bob | `@heedkit/sdk-js` |

Adapters declare `"@heedkit/sdk-js": "workspace:*"`. Published package names are unchanged
from the old per-repo SDKs — this was a structure change only, invisible to consumers.

## Core source (`packages/core/src/`)
- `client.ts` — HTTP + HeedKit `/sdk/*` API + HMAC identity/replay token (the core contract).
- `widget.ts` — floating widget, built via `innerHTML` strings; **preserve escaping, it's an
  XSS surface**.
- `index.ts` — public barrel (must re-export everything adapters use; e.g. `ProjectConfig`
  had to be added here).
- `Example/` — a plain consumer app wired to the Rails `/sdk` backend.

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
