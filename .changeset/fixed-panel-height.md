---
"@heedkit/sdk-js": patch
---

The widget panel now has a fixed height (min(640px, 85vh)) instead of sizing to
content, so switching between kind tabs, empty states, and the suggest form no
longer makes the modal jump. Lists scroll internally, empty/loading states center
in the panel, and the suggest form's description field grows to fill it.
