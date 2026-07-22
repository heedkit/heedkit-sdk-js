import * as React from "react";
import {
  ActivityIndicator,
  Appearance,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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
  type ShowCounts,
  type Theme,
  type Visibility,
} from "@heedkit/sdk-js";

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
  type ShowCounts,
  type Theme,
  type Visibility,
};

// ---------------------------------------------------------------------------
// Per-kind metadata. Kept here (not the client) because it's view-layer copy.
// ---------------------------------------------------------------------------

const KIND_META: Record<FeatureKind, { label: string; placeholder: string; tabIcon: string }> = {
  feature_request: { label: "Features",     placeholder: "What should we build?", tabIcon: "💡" },
  bug_report:      { label: "Bugs",         placeholder: "What's broken?",         tabIcon: "🐞" },
  improvement:     { label: "Improvements", placeholder: "What could be better?",  tabIcon: "✨" },
  appreciation:    { label: "Appreciation", placeholder: "What did you love?",     tabIcon: "❤️" },
  other:           { label: "Other",        placeholder: "Tell us anything",       tabIcon: "💬" },
};

const INTERACTION_META: Record<Interaction, { icon: string; label: string }> = {
  upvote:   { icon: "▲",  label: "Upvote" },
  downvote: { icon: "▼",  label: "Downvote" },
  plus_one: { icon: "+1", label: "+1" },
  like:     { icon: "♥",  label: "Like" },
};

const FONT_SIZES: Record<NonNullable<Theme["font_size"]>, number> = {
  sm: 13,
  md: 14,
  lg: 16,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type Ctx = { client: HeedKitClient; ready: boolean; theme: Theme };

const HeedKitContext = React.createContext<Ctx | null>(null);

export function HeedKitProvider({
  workspaceKey,
  apiUrl,
  user,
  children,
}: { children: React.ReactNode } & HeedKitConfig) {
  const [client] = React.useState(() => new HeedKitClient({ workspaceKey, apiUrl, user }));
  const [ready, setReady] = React.useState(false);
  const [theme, setTheme] = React.useState<Theme>({});

  React.useEffect(() => {
    client.init({ ...user, platform: user?.platform || "react-native" }).then(() => {
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

// Mobile-friendly singleton for users who don't want a provider.
export const HeedKit = {
  _instance: null as HeedKitClient | null,
  async init(config: HeedKitConfig) {
    this._instance = new HeedKitClient(config);
    return this._instance.init({ ...config.user, platform: config.user?.platform || "react-native" });
  },
  client(): HeedKitClient {
    if (!this._instance) throw new Error("HeedKit.init not called");
    return this._instance;
  },
};

// ---------------------------------------------------------------------------
// Theme palette derived from the server theme + the device color scheme when
// the user picked "system".
// ---------------------------------------------------------------------------

function usePalette(theme: Theme) {
  const [systemScheme, setSystemScheme] = React.useState(Appearance.getColorScheme());
  React.useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme));
    return () => sub.remove();
  }, []);

  const mode = theme.mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : theme.mode || "light";
  const dark = mode === "dark";

  return {
    primary: theme.primary || "#0D9488",
    radius: theme.radius ?? 12,
    fs: FONT_SIZES[theme.font_size ?? "md"] ?? 14,
    bg: dark ? "#0F172A" : "#FFFFFF",
    fg: dark ? "#F1F5F9" : "#0F172A",
    muted: dark ? "#94A3B8" : "#64748B",
    row: dark ? "#1E293B" : "#F8FAFC",
    border: dark ? "#1E293B" : "#E2E8F0",
    inputBorder: dark ? "#334155" : "#CBD5E1",
    inputBg: dark ? "#0F172A" : "#FFFFFF",
    dark,
  };
}

// ---------------------------------------------------------------------------
// Public components
// ---------------------------------------------------------------------------

export function FeedbackButton({ label = "Feedback" }: { label?: string }) {
  const ctx = React.useContext(HeedKitContext);
  const [open, setOpen] = React.useState(false);
  const p = usePalette(ctx?.theme || {});
  if (!ctx?.ready) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.fab, { backgroundColor: p.primary }]}
      >
        <Text style={[styles.fabLabel, { fontSize: p.fs }]}>{label}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <FeedbackScreen onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

type Mode = "browse" | "suggest";

export function FeedbackScreen({ onClose }: { onClose?: () => void }) {
  const ctx = React.useContext(HeedKitContext);
  const p = usePalette(ctx?.theme || {});

  if (!ctx?.ready) {
    return (
      <View style={[styles.center, { backgroundColor: p.bg, flex: 1 }]}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  const enabledKinds = ctx.client.getEnabledKinds();
  const groupMode: GroupMode = (ctx.theme.group_mode as GroupMode) || "tabs";
  const showCounts = ctx.theme.show_counts || {};

  const [mode, setMode] = React.useState<Mode>("browse");
  const [activeKind, setActiveKind] = React.useState<FeatureKind | "all">(
    groupMode === "tabs" && enabledKinds.length > 0 ? enabledKinds[0] : "all",
  );
  const [features, setFeatures] = React.useState<Feature[]>([]);
  const [loading, setLoading] = React.useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const opts: { sort: "top" | "new"; kind?: FeatureKind } = { sort: "top" };
      if (activeKind !== "all") opts.kind = activeKind;
      setFeatures(await ctx!.client.list(opts));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKind]);

  async function performInteraction(f: Feature, _i: Interaction) {
    // Backend currently has one vote toggle endpoint per feature; richer
    // per-interaction storage can be wired here later.
    const r = await ctx!.client.vote(f.id);
    setFeatures((arr) =>
      arr.map((x) => (x.id === f.id ? { ...x, voted: r.voted, vote_count: r.vote_count } : x)),
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <View style={[styles.header, { borderColor: p.border }]}>
        <Text style={[styles.title, { color: p.fg, fontSize: p.fs + 6 }]}>
          {ctx.client.getWorkspaceName() || "Feedback"}
        </Text>
        {onClose && (
          <Pressable onPress={onClose}>
            <Text style={{ color: p.primary, fontWeight: "600", fontSize: p.fs }}>Close</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.modeRow}>
        {(["browse", "suggest"] as Mode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[
              styles.modeBtn,
              { backgroundColor: mode === m ? p.primary : "transparent" },
            ]}
          >
            <Text style={{ color: mode === m ? "#fff" : p.muted, fontWeight: "600", fontSize: p.fs - 1 }}>
              {m === "browse" ? "Browse" : "Suggest"}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === "browse" && groupMode === "tabs" && enabledKinds.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tabRow, { borderColor: p.border }]}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 10 }}
        >
          {(["all", ...enabledKinds] as Array<FeatureKind | "all">).map((k) => {
            const active = activeKind === k;
            return (
              <Pressable
                key={k}
                onPress={() => setActiveKind(k)}
                style={[
                  styles.tab,
                  { backgroundColor: active ? p.primary : p.row },
                ]}
              >
                <Text style={{ color: active ? "#fff" : p.fg, fontSize: p.fs - 1, fontWeight: "500" }}>
                  {k === "all" ? "All" : `${KIND_META[k].tabIcon} ${KIND_META[k].label}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {mode === "browse" ? (
        loading ? (
          <View style={[styles.center, { flex: 1 }]}><ActivityIndicator color={p.primary} /></View>
        ) : features.length === 0 ? (
          <View style={[styles.center, { flex: 1 }]}>
            <Text style={{ color: p.muted, fontSize: p.fs }}>No items yet — be the first!</Text>
          </View>
        ) : (
          <FlatList
            data={features}
            keyExtractor={(f) => f.id}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item }) => (
              <Row
                feature={item}
                palette={p}
                interactions={ctx!.client.getInteractionsFor(item.kind)}
                showCount={showCounts[item.kind] !== false}
                onInteraction={(i) => performInteraction(item, i)}
              />
            )}
          />
        )
      ) : (
        <SubmitForm
          palette={p}
          enabledKinds={enabledKinds.length > 0 ? enabledKinds : ["other"]}
          onSubmitted={async () => {
            setMode("browse");
            await refresh();
          }}
        />
      )}

      <Pressable
        style={{ borderTopWidth: 1, borderColor: p.border, paddingVertical: 8, alignItems: "center" }}
        onPress={() => Linking.openURL("https://heedkit.com/?ref=widget").catch(() => {})}
        accessibilityRole="link"
      >
        <Text style={{ color: p.muted, fontSize: p.fs - 3 }}>
          Powered by <Text style={{ fontWeight: "600" }}>HeedKit</Text>
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Row + form (private)
// ---------------------------------------------------------------------------

function Row({
  feature: f, palette: p, interactions, showCount, onInteraction,
}: {
  feature: Feature;
  palette: ReturnType<typeof usePalette>;
  interactions: Interaction[];
  showCount: boolean;
  onInteraction: (i: Interaction) => void;
}) {
  return (
    <View style={[styles.row, { backgroundColor: p.row, borderRadius: p.radius }]}>
      <View style={styles.actionCol}>
        {interactions.length === 0 ? (
          showCount && (
            <View style={[styles.actBtn, { borderColor: p.border, borderRadius: p.radius - 4 }]}>
              <Text style={{ color: p.fg, fontWeight: "600", fontSize: p.fs - 1 }}>{f.vote_count}</Text>
            </View>
          )
        ) : (
          interactions.map((i) => (
            <Pressable
              key={i}
              onPress={() => onInteraction(i)}
              style={[
                styles.actBtn,
                {
                  borderRadius: p.radius - 4,
                  borderColor: f.voted ? p.primary : p.border,
                  borderWidth: f.voted ? 2 : 1,
                  backgroundColor: f.voted ? p.primary + "22" : "transparent",
                },
              ]}
            >
              <Text style={{ color: f.voted ? p.primary : p.fg, fontSize: p.fs + 1 }}>
                {INTERACTION_META[i].icon}
              </Text>
              {showCount && (
                <Text style={{ color: f.voted ? p.primary : p.fg, fontSize: p.fs - 2, fontWeight: "600" }}>
                  {f.vote_count}
                </Text>
              )}
            </Pressable>
          ))
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.fg, fontWeight: "600", fontSize: p.fs }}>{f.title}</Text>
        {!!f.description && (
          <Text
            style={{ color: p.muted, fontSize: p.fs - 1, marginTop: 4 }}
            numberOfLines={3}
          >{f.description}</Text>
        )}
        {(f.status !== "open" || f.tag) && (
          <View style={styles.badges}>
            {f.status !== "open" && (
              <Text style={[styles.badge, { backgroundColor: p.border, color: p.muted, fontSize: p.fs - 3 }]}>
                {f.status.replace("_", " ")}
              </Text>
            )}
            {!!f.tag && (
              <Text style={[styles.badge, { backgroundColor: p.border, color: p.muted, fontSize: p.fs - 3 }]}>
                {f.tag}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function SubmitForm({
  palette: p, enabledKinds, onSubmitted,
}: {
  palette: ReturnType<typeof usePalette>;
  enabledKinds: FeatureKind[];
  onSubmitted: () => void;
}) {
  const ctx = React.useContext(HeedKitContext)!;
  const [kind, setKind] = React.useState<FeatureKind>(enabledKinds[0]);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await ctx.client.submit({ title, description, kind });
      setTitle("");
      setDescription("");
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ color: p.fg, fontWeight: "500", fontSize: p.fs - 1 }}>What's this about?</Text>
      <View style={[styles.segmented, { backgroundColor: p.row }]}>
        {enabledKinds.map((k) => {
          const active = k === kind;
          return (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={[
                styles.seg,
                {
                  backgroundColor: active ? p.bg : "transparent",
                  borderRadius: 999,
                },
              ]}
            >
              <Text style={{ color: active ? p.fg : p.muted, fontWeight: "500", fontSize: p.fs - 2 }}>
                {KIND_META[k].label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ color: p.fg, fontWeight: "500", fontSize: p.fs - 1 }}>Title</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={KIND_META[kind].placeholder}
        placeholderTextColor={p.muted}
        style={[styles.input, { borderColor: p.inputBorder, color: p.fg, backgroundColor: p.inputBg, borderRadius: p.radius - 2 }]}
      />

      <Text style={{ color: p.fg, fontWeight: "500", fontSize: p.fs - 1 }}>Description</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Any extra context helps."
        placeholderTextColor={p.muted}
        multiline
        numberOfLines={4}
        style={[
          styles.input,
          { borderColor: p.inputBorder, color: p.fg, backgroundColor: p.inputBg, borderRadius: p.radius - 2, height: 100 },
        ]}
      />

      <Pressable
        disabled={!title || submitting}
        onPress={submit}
        style={[
          styles.submit,
          { backgroundColor: p.primary, opacity: !title || submitting ? 0.6 : 1, borderRadius: p.radius },
        ]}
      >
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: p.fs }}>
          {submitting ? "Submitting…" : "Submit"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  title: { fontWeight: "700" },
  modeRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 10 },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  tabRow: { maxHeight: 48, borderBottomWidth: 1 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  row: { flexDirection: "row", gap: 12, padding: 12, alignItems: "flex-start" },
  actionCol: { gap: 4 },
  actBtn: {
    minWidth: 44, paddingHorizontal: 8, paddingVertical: 6,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  badges: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  badge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  segmented: { flexDirection: "row", padding: 4, borderRadius: 999, gap: 4, alignSelf: "flex-start", flexWrap: "wrap" },
  seg: { paddingHorizontal: 12, paddingVertical: 6 },
  input: { borderWidth: 1, padding: 12, fontSize: 14 },
  submit: { padding: 14, alignItems: "center", marginTop: 8 },
  fab: {
    position: "absolute", bottom: 24, right: 24,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabLabel: { color: "#fff", fontWeight: "600" },
});
