import * as React from "react";

import {
  HeedKitClient,
  type Comment,
  type EndUser,
  type Feature,
  type FeatureKind,
  type HeedKitConfig,
  type GroupMode,
  type InitResult,
  type Interaction,
  type KindInteractions,
  type ProjectConfig,
  type ShowCounts,
  type Theme,
  type Visibility,
} from "@heedkit/sdk-js";
import { mount, type MountOptions, type Widget } from "@heedkit/sdk-js";

export {
  HeedKitClient,
  type Comment,
  type EndUser,
  type Feature,
  type FeatureKind,
  type HeedKitConfig,
  type GroupMode,
  type InitResult,
  type Interaction,
  type KindInteractions,
  type ProjectConfig,
  type ShowCounts,
  type Theme,
  type Visibility,
  mount,
  type MountOptions,
  type Widget,
};

// ---------------------------------------------------------------------------
// React context — exposes the underlying client to nested components that
// want imperative access (`useHeedKit().client`).
// ---------------------------------------------------------------------------

type Ctx = {
  client: HeedKitClient;
  ready: boolean;
  theme: Theme;
};

const HeedKitContext = React.createContext<Ctx | null>(null);

export function HeedKitProvider({
  projectKey,
  apiUrl,
  user,
  children,
}: { children: React.ReactNode } & HeedKitConfig) {
  const [client] = React.useState(() => new HeedKitClient({ projectKey, apiUrl, user }));
  const [ready, setReady] = React.useState(false);
  const [theme, setTheme] = React.useState<Theme>({});

  React.useEffect(() => {
    client.init(user || {}).then(() => {
      setTheme(client.getTheme());
      setReady(true);
    });
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <HeedKitContext.Provider value={{ client, ready, theme }}>
      {children}
    </HeedKitContext.Provider>
  );
}

export function useHeedKit() {
  const ctx = React.useContext(HeedKitContext);
  if (!ctx) throw new Error("useHeedKit must be used inside <HeedKitProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// <FeedbackButton/> — declarative wrapper around the imperative `mount()`.
//
// We delegate to the JS widget so React, Vue, Angular, and the bare script tag
// all render the same UI. The component owns lifecycle: mount on first render,
// destroy on unmount. No DOM React tree is created for the widget itself.
// ---------------------------------------------------------------------------

export type FeedbackButtonProps = HeedKitConfig & {
  /** Floating launcher label. Default: "Feedback". */
  label?: string;
  /** Hide the floating launcher (call `widget.current?.open()` yourself). */
  hideLauncher?: boolean;
};

export const FeedbackButton = React.forwardRef<Widget | null, FeedbackButtonProps>(
  function FeedbackButton(
    { projectKey, apiUrl, user, label, hideLauncher }: FeedbackButtonProps,
    ref: React.ForwardedRef<Widget | null>,
  ) {
    const widgetRef = React.useRef<Widget | null>(null);

    React.useEffect(() => {
      const w = mount({ projectKey, apiUrl, user, label, hideLauncher });
      widgetRef.current = w;
      if (typeof ref === "function") ref(w);
      else if (ref) ref.current = w;
      return () => {
        w.destroy();
        widgetRef.current = null;
        if (typeof ref === "function") ref(null);
        else if (ref) ref.current = null;
      };
      // Re-mount when any config prop changes. `user` is serialized so a new but
      // value-equal object each render doesn't trigger a needless re-init. Each
      // change destroys the widget and creates a fresh client + init() call, so
      // callers who care about init cost should keep `user` stable.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectKey, apiUrl, label, hideLauncher, JSON.stringify(user)]);

    return null;
  },
);
