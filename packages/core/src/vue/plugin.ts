import { ref, type App, type InjectionKey, type Ref } from "vue";
import { HeedKitClient, type EndUser, type HeedKitConfig, type Theme } from "../index";

export type HeedKitInjection = {
  client: HeedKitClient;
  ready: Ref<boolean>;
  theme: Ref<Theme>;
  // Persisted so FeedbackButton can re-mount the shared JS widget without
  // reaching into the client's private fields.
  workspaceKey: string;
  apiUrl?: string;
  user?: EndUser;
};

export const HEEDKIT_KEY: InjectionKey<HeedKitInjection> = Symbol("heedkit");

export function createHeedKit(config: HeedKitConfig) {
  return {
    install(app: App) {
      const client = new HeedKitClient(config);
      const ready = ref(false);
      const theme = ref<Theme>({});
      client.init(config.user || {}).then(() => {
        theme.value = client.getTheme();
        ready.value = true;
      });
      app.provide(HEEDKIT_KEY, {
        client, ready, theme,
        workspaceKey: config.workspaceKey,
        apiUrl: config.apiUrl,
        user: config.user,
      });
    },
  };
}
