import { EnvironmentProviders, makeEnvironmentProviders } from "@angular/core";
import type { HeedKitConfig } from "@heedkit/sdk-js";
import { HEEDKIT_CONFIG, HeedKitService } from "./heedkit.service";

export function provideHeedKit(config: HeedKitConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: HEEDKIT_CONFIG, useValue: config },
    HeedKitService,
  ]);
}
