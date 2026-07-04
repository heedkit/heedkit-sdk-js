<script setup lang="ts">
// Thin Vue wrapper that imperatively mounts the shared JS widget. Keeps every
// SDK rendering the same UI without duplicating widget code per framework.
import { inject, onBeforeUnmount, onMounted, watch } from "vue";

import { HEEDKIT_KEY, type HeedKitInjection } from "./plugin";
import { mount, type Widget } from "@heedkit/sdk-js";

const props = defineProps<{
  label?: string;
  hideLauncher?: boolean;
}>();

const fh = inject<HeedKitInjection>(HEEDKIT_KEY);
if (!fh) throw new Error("Install the HeedKit plugin first: app.use(createHeedKit(...))");

let widget: Widget | null = null;

function ensureMounted() {
  if (widget) return;
  widget = mount({
    projectKey: fh!.projectKey,
    apiUrl: fh!.apiUrl,
    user: fh!.user,
    label: props.label,
    hideLauncher: props.hideLauncher,
  });
}

// `ready` flips once init() resolves — mount then so the theme is available.
watch(() => fh.ready.value, (ready) => {
  if (ready) ensureMounted();
}, { immediate: true });

onMounted(() => {
  if (fh.ready.value) ensureMounted();
});

onBeforeUnmount(() => {
  widget?.destroy();
  widget = null;
});

defineExpose({
  open: () => widget?.open(),
  close: () => widget?.close(),
});
</script>

<template>
  <!-- The widget renders into document.body via mount(); this component has no
       template content of its own. -->
</template>
