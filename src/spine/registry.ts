// Phase 4 — Command registry
//
// The single source of truth for every action family the spine accepts.
// The validator rejects anything not in this list. New action families do
// not become reachable until a registry entry exists AND a Tauri command
// backs it (see Rust executor.rs).

export type ActionKind =
  | "app.open"
  | "folder.open"
  | "service.open"
  | "settings.open"
  | "volume.set";

export type RequiredField = "path" | "url" | "identifier" | "bundle_id";

export interface RegistryEntry {
  action: ActionKind;
  // Phase 3 target_kind values that map to this action.
  targetKinds: ReadonlyArray<string>;
  // Fields required on PreviewTargetRef before the action is executable.
  required: ReadonlyArray<RequiredField>;
  // True only when a real native command surface backs this action.
  executable: boolean;
}

export const COMMAND_REGISTRY: ReadonlyArray<RegistryEntry> = [
  {
    action: "app.open",
    targetKinds: ["app"],
    required: ["path"],
    executable: true,
  },
  {
    action: "folder.open",
    targetKinds: ["folder", "volume"],
    required: ["path"],
    executable: true,
  },
  {
    action: "service.open",
    targetKinds: ["service"],
    required: ["url"],
    executable: true,
  },
  {
    action: "settings.open",
    targetKinds: ["settings_pane"],
    required: ["identifier"],
    executable: true,
  },
  {
    action: "volume.set",
    targetKinds: [],
    required: [],
    executable: false,
  },
];

export function findEntry(action: ActionKind): RegistryEntry | undefined {
  return COMMAND_REGISTRY.find((e) => e.action === action);
}

export function actionFromTargetKind(targetKind: string): ActionKind | null {
  for (const entry of COMMAND_REGISTRY) {
    if (entry.targetKinds.includes(targetKind)) return entry.action;
  }
  return null;
}
