import { Component, Input, OnDestroy, OnInit, effect, inject } from "@angular/core";

import { HeedKitService } from "./heedkit.service";
import { mount, type Widget } from "../index";

/**
 * Thin Angular wrapper around the shared JS widget — same rendering as the
 * other framework SDKs. The component has no template; the widget injects
 * itself into document.body via mount().
 */
@Component({
  selector: "heedkit-button",
  standalone: true,
  template: "",
})
export class FeedbackButtonComponent implements OnInit, OnDestroy {
  @Input() label?: string;
  @Input() hideLauncher = false;

  private svc = inject(HeedKitService);
  private widget: Widget | null = null;

  constructor() {
    // Mount lazily once init() resolves so the widget has the theme.
    effect(() => {
      if (this.svc.ready() && !this.widget) {
        this.widget = mount({
          projectKey: this.svc.projectKey,
          apiUrl: this.svc.apiUrl,
          user: this.svc.user,
          label: this.label,
          hideLauncher: this.hideLauncher,
        });
      }
    });
  }

  ngOnInit() {
    // Effect above handles the mount; this hook is here so the lifecycle is
    // explicit to consumers reading the class.
  }

  ngOnDestroy() {
    this.widget?.destroy();
    this.widget = null;
  }

  open() { this.widget?.open(); }
  close() { this.widget?.close(); }
}
