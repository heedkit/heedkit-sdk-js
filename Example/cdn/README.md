# No-build (CDN widget) variant

A single static HTML file that mounts the prebuilt FeatureKit widget via a
`<script>` tag — no npm install, no bundler. Open `index.html` directly in a
browser.

This is the quickest possible integration. For a worked example that walks each
step of the API flow (init → list → submit → vote → comment) using the
lower-level `FeatureKitClient`, see the Vite demo in the parent folder
(`../`).

## Setup

1. Run the Rails backend: `cd featurekit-rails && bin/dev` (port 3000).
2. Edit `index.html`:
   - `projectKey` → your `pk_...` key from the console Install page.
   - `apiUrl` → the Rails origin. Browser dev default is
     `http://featurekit.localhost:3000`. Use `http://localhost:3000` for an
     iOS simulator and `http://10.0.2.2:3000` for an Android emulator.

The SDK appends `/sdk` to `apiUrl` and sends `X-Project-Key` on every request.
