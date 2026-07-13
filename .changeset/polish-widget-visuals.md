---
"@heedkit/sdk-js": patch
---

Widget visual polish + theme hardening. Theme fonts now always fall back to the
system sans stack — a project theme naming a font the host page never loads (the
default is "Inter") no longer renders in browser-default serif. Theme radius values
like `"0.75rem"` are normalized instead of producing invalid CSS. Refreshed cards,
vote buttons, tabs, forms, and comment threads with hover/active/focus states, a
host-CSS reset inside the widget, and subtle open animations (with a
prefers-reduced-motion guard).
