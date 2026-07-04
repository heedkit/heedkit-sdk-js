import { defineConfig } from "tsup";

export default defineConfig([
  // npm consumers (ESM + CJS + d.ts)
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: false,
  },
  // <script src="..."> consumers: single IIFE bundle exposing window.HeedKit
  {
    entry: { "heedkit": "src/index.ts" },
    format: ["iife"],
    globalName: "HeedKit",
    minify: true,
    sourcemap: true,
    outExtension: () => ({ js: ".iife.js" }),
  },
]);
