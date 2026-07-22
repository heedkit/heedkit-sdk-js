// Thin Vue wrapper that imperatively mounts the shared JS widget. Written as a plain
// defineComponent (not an SFC) so the whole package builds with one tsup pass — the
// component has no template of its own (the widget renders into document.body via mount()).
import { defineComponent, inject, onBeforeUnmount, onMounted, watch } from "vue";

import { HEEDKIT_KEY, type HeedKitInjection } from "./plugin";
import { mount, type Widget } from "../index";

export default defineComponent({
  name: "FeedbackButton",
  props: {
    label: { type: String, required: false },
    hideLauncher: { type: Boolean, default: false },
  },
  setup(props, { expose }) {
    const fh = inject<HeedKitInjection>(HEEDKIT_KEY);
    if (!fh) throw new Error("Install the HeedKit plugin first: app.use(createHeedKit(...))");

    let widget: Widget | null = null;

    function ensureMounted() {
      if (widget) return;
      widget = mount({
        workspaceKey: fh!.workspaceKey,
        apiUrl: fh!.apiUrl,
        user: fh!.user,
        label: props.label,
        hideLauncher: props.hideLauncher,
      });
    }

    // `ready` flips once init() resolves — mount then so the theme is available.
    watch(
      () => fh.ready.value,
      (ready) => { if (ready) ensureMounted(); },
      { immediate: true },
    );

    onMounted(() => {
      if (fh.ready.value) ensureMounted();
    });

    onBeforeUnmount(() => {
      widget?.destroy();
      widget = null;
    });

    expose({
      open: () => widget?.open(),
      close: () => widget?.close(),
    });

    // No template content — the widget lives in document.body.
    return () => null;
  },
});
