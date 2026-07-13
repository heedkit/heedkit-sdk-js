---
"@heedkit/sdk-js": minor
---

Fix the identity contract so the SDK actually works against the HeedKit API.

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
