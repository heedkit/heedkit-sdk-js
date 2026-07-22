import { Inject, Injectable, InjectionToken, signal } from "@angular/core";

import {
  HeedKitClient,
  type EndUser,
  type HeedKitConfig,
  type Theme,
} from "../index";

export const HEEDKIT_CONFIG = new InjectionToken<HeedKitConfig>(
  "HEEDKIT_CONFIG",
);

@Injectable({ providedIn: "root" })
export class HeedKitService {
  readonly client: HeedKitClient;
  readonly ready = signal(false);
  readonly theme = signal<Theme>({});

  // Persisted on the service so the button component can re-mount the shared
  // JS widget without reaching into the client's private fields.
  readonly workspaceKey: string;
  readonly apiUrl: string | undefined;
  readonly user: EndUser | undefined;

  constructor(@Inject(HEEDKIT_CONFIG) cfg: HeedKitConfig) {
    this.client = new HeedKitClient(cfg);
    this.workspaceKey = cfg.workspaceKey;
    this.apiUrl = cfg.apiUrl;
    this.user = cfg.user;
    this.client.init(cfg.user || {}).then(() => {
      this.theme.set(this.client.getTheme());
      this.ready.set(true);
    });
  }
}
