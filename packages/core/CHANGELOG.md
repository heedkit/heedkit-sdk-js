# @heedkit/sdk-js

## 0.3.4

### Patch Changes

- 5216765: The Suggest form now inherits the kind the user was browsing — filtering to e.g. Appreciation and hitting "Suggest one →" (or the Suggest tab) preselects Appreciation instead of silently defaulting back to Features.
- A quiet "Suggest one →" link now sits at the end of a populated browse list (the prominent pill remains empty-state only).

## 0.3.3

### Patch Changes

- 2c5a2c4: Empty browse states now include a "Suggest one →" button that jumps to the
  suggest form, and the panel shows a small "Powered by HeedKit" footer linking
  to heedkit.com.

## 0.3.2

### Patch Changes

- 9ae2306: The widget panel now has a fixed height (min(640px, 85vh)) instead of sizing to
  content, so switching between kind tabs, empty states, and the suggest form no
  longer makes the modal jump. Lists scroll internally, empty/loading states center
  in the panel, and the suggest form's description field grows to fill it.

## 0.3.1

### Patch Changes

- d17687d: Widget visual polish + theme hardening. Theme fonts now always fall back to the
  system sans stack — a project theme naming a font the host page never loads (the
  default is "Inter") no longer renders in browser-default serif. Theme radius values
  like `"0.75rem"` are normalized instead of producing invalid CSS. Refreshed cards,
  vote buttons, tabs, forms, and comment threads with hover/active/focus states, a
  host-CSS reset inside the widget, and subtle open animations (with a
  prefers-reduced-motion guard).

## 0.3.0

### Minor Changes

- f421796: Fix the identity contract so the SDK actually works against the HeedKit API.

  - `EndUser` gains `userHash` and `init()` now transmits it as `user_hash` — previously
    there was nowhere to pass the backend-computed HMAC, so any identified `init` was
    rejected with `401 invalid_user_signature`.
  - `init()` now captures the server-issued `identity` token (`InitResult.identity`) and
    replays it as the `X-HeedKit-Identity` header on every later call. Legacy
    `end_user_id` params/body fields (ignored by the API) are gone.
  - Anonymous flow repaired: the device-id fallback (which sent an unsigned `external_id`
    the API rejects) is replaced by persisting the server-issued identity token in
    `localStorage`, scoped per project key. Continuity across page loads is preserved; a
    stale persisted identity self-heals (one fresh anonymous re-init + retry on 401).
  - BREAKING (minor, pre-1.0): the `getOrCreateDeviceId` helper was removed from
    `client.ts` — it enabled the broken unsigned-id flow. It was never exported from the
    package entry points.

## 0.2.2

### Patch Changes

- Ship the agent integration skill (`skills/heedkit-sdk-integration/SKILL.md`) inside the
  published package so coding agents that install `@heedkit/sdk-js` can discover how to
  integrate it. Docs/packaging only — no code changes.

## 0.2.1

### Patch Changes

- Add a comprehensive README (install, vanilla `mount()` widget, `<script>`/CDN usage, the
  React/Vue/Angular subpath imports, user identity + HMAC, and the full `HeedKitClient` API).
  Docs-only — no code changes.

## 0.2.0

### Minor Changes

- Ship the React, Vue, and Angular bindings from this package as subpath exports
  (`@heedkit/sdk-js/react`, `/vue`, `/angular`), so one install covers every web framework.
  The former standalone `@heedkit/sdk-react`, `@heedkit/sdk-vue`, and `@heedkit/sdk-angular`
  packages are superseded. Frameworks are optional peer dependencies, so plain-JS usage is
  unaffected. No breaking changes to the existing `@heedkit/sdk-js` entry.
# 0.4.0

- Breaking: replace the Project API with Workspace terminology (`workspaceKey`,
  `WorkspaceConfig`, `InitResult.workspace`, and `getWorkspaceName()`).
- Send `X-Workspace-Key` and migrate cached init configuration without changing
  the persisted identity-storage key.
