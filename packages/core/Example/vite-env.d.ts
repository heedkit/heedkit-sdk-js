/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HEEDKIT_WORKSPACE_KEY?: string;
  readonly VITE_HEEDKIT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
