import { defineConfig } from "tsup";

export default defineConfig([
  // npm consumers: the core plus per-framework subpath entries
  // (@heedkit/sdk-js, /react, /vue, /angular). ESM + CJS + d.ts.
  {
    entry: {
      index: "src/index.ts",
      react: "src/react.tsx",
      vue: "src/vue/index.ts",
      angular: "src/angular/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: false,
    // Frameworks are peer deps — never bundle them into our output.
    external: ["react", "vue", "@angular/core", "@angular/common", "rxjs"],
    // react.tsx needs the automatic JSX runtime; the Angular wrapper uses decorators.
    esbuildOptions(options) {
      options.jsx = "automatic";
      options.tsconfig = "tsconfig.json";
    },
  },
  // <script src="..."> consumers: single IIFE bundle exposing window.HeedKit (core only).
  {
    entry: { "heedkit": "src/index.ts" },
    format: ["iife"],
    globalName: "HeedKit",
    minify: true,
    sourcemap: true,
    outExtension: () => ({ js: ".iife.js" }),
  },
]);
