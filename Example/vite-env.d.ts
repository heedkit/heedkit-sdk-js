/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATUREKIT_PROJECT_KEY?: string;
  readonly VITE_FEATUREKIT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
