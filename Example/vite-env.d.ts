/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HEEDKIT_PROJECT_KEY?: string;
  readonly VITE_HEEDKIT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
