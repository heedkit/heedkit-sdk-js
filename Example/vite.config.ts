import { defineConfig } from "vite";

// This demo imports the SDK directly from its TypeScript source at ../src
// (see main.ts: `import { HeedKitClient } from "../src"`). Vite compiles and
// bundles that source on the fly — no separate SDK build step is required.
//
// `fs.allow` is widened to the repo root so Vite's dev server is permitted to
// read ../src, which lives above this example folder.
export default defineConfig({
  root: __dirname,
  server: {
    port: 5173,
    fs: {
      allow: [".."],
    },
  },
});
