// Phase 3 Slice 1 — Native Environment Index
//
// Builds an in-memory searchable index from one NativeEnvironmentSnapshot.
// Pure data transform: no I/O, no invoke calls, no native probes. Designed so
// the resolver does not care about the source — every entity flows through
// the same shape (id, label, aliases, target_kind, source, source_boost).
//
// A search library can replace this index later without changing the resolver
// contract: the resolver only depends on `entities` and `byAlias`.

import type {
  DockPinnedApp,
  InstalledApp,
  KnownFolder,
  NativeEnvironmentSnapshot,
  Service,
  SettingsPane,
  Volume,
} from "../types/nativeEnvironment";

export type IndexSource =
  | "static_inventory"
  | "user_preference_signals"
  | "live_runtime_state"
  | "permission_capability_map"
  | "grammar"
  | "service_seed";

export type IndexTargetKind =
  | "app"
  | "folder"
  | "service"
  | "settings_pane"
  | "volume";

export const SOURCE_BOOSTS: Record<IndexSource, number> = {
  live_runtime_state: 50,
  user_preference_signals: 30,
  static_inventory: 10,
  service_seed: 8,
  grammar: 5,
  permission_capability_map: 0,
};

export interface IndexedEntity {
  id: string;
  label: string;
  aliases: string[];
  target_kind: IndexTargetKind;
  source: IndexSource;
  source_boost: number;
  path?: string;
  bundle_id?: string | null;
  url?: string;
  // Generic executor target identifier. For settings panes this intentionally
  // stores the full x-apple.systempreferences anchor URL, not the short pane id.
  identifier?: string;
}

export interface NativeEnvironmentIndex {
  entities: IndexedEntity[];
  byAlias: Map<string, IndexedEntity[]>;
}

// ─── Normalisation ──────────────────────────────────────────────────────────

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function camelToSpaced(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function aliasesFor(label: string, extras: readonly string[] = []): string[] {
  const set = new Set<string>();
  const base = normalizeText(label);
  if (base) set.add(base);

  const unspaced = base.replace(/\s+/g, "");
  if (unspaced && unspaced !== base) set.add(unspaced);

  const tokens = base.split(" ").filter(Boolean);
  if (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (last) set.add(last);
  }

  const camelSpaced = normalizeText(camelToSpaced(label));
  if (camelSpaced && camelSpaced !== base) set.add(camelSpaced);

  for (const extra of extras) {
    const n = normalizeText(extra);
    if (n) set.add(n);
  }

  return Array.from(set);
}

// ─── Service seed (deterministic) ───────────────────────────────────────────

const SERVICE_SEEDS: readonly IndexedEntity[] = [
  {
    id: "service:youtube",
    label: "YouTube",
    aliases: aliasesFor("YouTube", ["yt", "utube", "you tube"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://www.youtube.com",
    identifier: "youtube",
  },
  {
    id: "service:gmail",
    label: "Gmail",
    aliases: aliasesFor("Gmail", ["email", "mail", "gml"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://mail.google.com",
    identifier: "gmail",
  },
  {
    id: "service:spotify",
    label: "Spotify",
    aliases: aliasesFor("Spotify", ["spot"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://open.spotify.com",
    identifier: "spotify",
  },
  {
    id: "service:google",
    label: "Google",
    aliases: aliasesFor("Google", ["search", "google search"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://www.google.com",
    identifier: "google",
  },
  {
    id: "service:github",
    label: "GitHub",
    aliases: aliasesFor("GitHub", ["gh", "git hub"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://github.com",
    identifier: "github",
  },
  {
    id: "service:netflix",
    label: "Netflix",
    aliases: aliasesFor("Netflix", ["nf", "flix"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://www.netflix.com",
    identifier: "netflix",
  },
  {
    id: "service:twitter",
    label: "X",
    aliases: aliasesFor("X", ["twitter", "tweets", "x.com"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://x.com",
    identifier: "twitter",
  },
  {
    id: "service:reddit",
    label: "Reddit",
    aliases: aliasesFor("Reddit", ["rdt"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://www.reddit.com",
    identifier: "reddit",
  },
  {
    id: "service:notion",
    label: "Notion",
    aliases: aliasesFor("Notion"),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://www.notion.so",
    identifier: "notion",
  },
  {
    id: "service:slack",
    label: "Slack",
    aliases: aliasesFor("Slack"),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://app.slack.com",
    identifier: "slack",
  },
  {
    id: "service:chatgpt",
    label: "ChatGPT",
    aliases: aliasesFor("ChatGPT", ["gpt", "chat gpt", "openai"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://chatgpt.com",
    identifier: "chatgpt",
  },
  {
    id: "service:claude",
    label: "Claude",
    aliases: aliasesFor("Claude", ["anthropic"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://claude.ai",
    identifier: "claude",
  },
  {
    id: "service:drive",
    label: "Google Drive",
    aliases: aliasesFor("Google Drive", ["gdrive", "drive"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://drive.google.com",
    identifier: "drive",
  },
  {
    id: "service:maps",
    label: "Google Maps",
    aliases: aliasesFor("Google Maps", ["gmaps", "maps"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://maps.google.com",
    identifier: "maps",
  },
  {
    id: "service:amazon",
    label: "Amazon",
    aliases: aliasesFor("Amazon", ["amz", "aws"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://www.amazon.com",
    identifier: "amazon",
  },
  {
    id: "service:linkedin",
    label: "LinkedIn",
    aliases: aliasesFor("LinkedIn", ["li", "linked in"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://www.linkedin.com",
    identifier: "linkedin",
  },
  {
    id: "service:whatsapp",
    label: "WhatsApp Web",
    aliases: aliasesFor("WhatsApp Web", ["whatsapp", "whats app", "wa"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://web.whatsapp.com",
    identifier: "whatsapp",
  },
  {
    id: "service:calendar",
    label: "Google Calendar",
    aliases: aliasesFor("Google Calendar", ["gcal", "calendar"]),
    target_kind: "service",
    source: "service_seed",
    source_boost: SOURCE_BOOSTS.service_seed,
    url: "https://calendar.google.com",
    identifier: "calendar",
  },
];

// ─── Per-source projection ──────────────────────────────────────────────────

function indexInstalledApp(app: InstalledApp): IndexedEntity {
  const id = app.bundle_id ? `app:${app.bundle_id}` : `app:${app.path}`;
  return {
    id,
    label: app.display_name,
    aliases: aliasesFor(app.display_name),
    target_kind: "app",
    source: "static_inventory",
    source_boost: SOURCE_BOOSTS.static_inventory,
    path: app.path,
    bundle_id: app.bundle_id,
  };
}

function indexDockPinnedApp(dock: DockPinnedApp): IndexedEntity | null {
  const label = dock.label;
  if (!label) return null;
  const idKey = dock.bundle_id ?? dock.path ?? label;
  const entity: IndexedEntity = {
    id: `dock:${idKey}`,
    label,
    aliases: aliasesFor(label),
    target_kind: "app",
    source: "user_preference_signals",
    source_boost: SOURCE_BOOSTS.user_preference_signals,
    bundle_id: dock.bundle_id,
  };
  if (dock.path) entity.path = dock.path;
  return entity;
}

function humanizeFolderKind(kind: string): string {
  switch (kind) {
    case "home":
      return "Home";
    case "documents":
      return "Documents";
    case "downloads":
      return "Downloads";
    case "desktop":
      return "Desktop";
    case "music":
      return "Music";
    case "pictures":
      return "Pictures";
    case "movies":
      return "Movies";
    case "public":
      return "Public";
    case "library":
      return "Library";
    case "icloud_drive":
      return "iCloud Drive";
    default:
      return kind;
  }
}

function indexKnownFolder(folder: KnownFolder): IndexedEntity {
  const label = humanizeFolderKind(folder.kind);
  return {
    id: `folder:${folder.kind}`,
    label,
    aliases: aliasesFor(label, [folder.kind]),
    target_kind: "folder",
    source: "static_inventory",
    source_boost: SOURCE_BOOSTS.static_inventory,
    path: folder.path,
  };
}

function indexService(svc: Service): IndexedEntity {
  return {
    id: `system_service:${svc.path}`,
    label: svc.name,
    aliases: aliasesFor(svc.name),
    target_kind: "service",
    source: "static_inventory",
    source_boost: SOURCE_BOOSTS.static_inventory,
    path: svc.path,
  };
}

function indexSettingsPane(pane: SettingsPane): IndexedEntity {
  return {
    id: `settings_pane:${pane.identifier}`,
    label: pane.label,
    aliases: aliasesFor(pane.label, [pane.identifier]),
    target_kind: "settings_pane",
    source: "static_inventory",
    source_boost: SOURCE_BOOSTS.static_inventory,
    // Store the launchable anchor URL in the generic executor identifier slot.
    // The short Rust pane identifier remains encoded in the entity id/aliases.
    identifier: pane.anchor,
  };
}

function indexVolume(vol: Volume): IndexedEntity {
  return {
    id: `volume:${vol.mount_path}`,
    label: vol.name,
    aliases: aliasesFor(vol.name),
    target_kind: "volume",
    source: "live_runtime_state",
    source_boost: SOURCE_BOOSTS.live_runtime_state,
    path: vol.mount_path,
  };
}

// ─── Builder ────────────────────────────────────────────────────────────────

export function buildNativeEnvironmentIndex(
  snapshot: NativeEnvironmentSnapshot,
): NativeEnvironmentIndex {
  const entities: IndexedEntity[] = [];

  const installed = snapshot.static_inventory.installed_apps;
  if (installed.kind === "available") {
    for (const app of installed.data) entities.push(indexInstalledApp(app));
  }

  const dock = snapshot.user_preference_signals.dock_pinned_apps;
  if (dock.kind === "available") {
    for (const item of dock.data) {
      const e = indexDockPinnedApp(item);
      if (e) entities.push(e);
    }
  }

  const folders = snapshot.static_inventory.known_folders;
  if (folders.kind === "available") {
    for (const folder of folders.data) entities.push(indexKnownFolder(folder));
  }

  const services = snapshot.static_inventory.services;
  if (services.kind === "available") {
    for (const svc of services.data) entities.push(indexService(svc));
  }

  const panes = snapshot.static_inventory.system_settings_panes;
  if (panes.kind === "available") {
    for (const pane of panes.data) entities.push(indexSettingsPane(pane));
  }

  const volumes = snapshot.live_runtime_state.mounted_volumes;
  if (volumes.kind === "available") {
    for (const vol of volumes.data) entities.push(indexVolume(vol));
  }

  for (const seed of SERVICE_SEEDS) entities.push(seed);

  const byAlias = new Map<string, IndexedEntity[]>();
  for (const e of entities) {
    for (const alias of e.aliases) {
      const arr = byAlias.get(alias);
      if (arr) arr.push(e);
      else byAlias.set(alias, [e]);
    }
  }

  return { entities, byAlias };
}
