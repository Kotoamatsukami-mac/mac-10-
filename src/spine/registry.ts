// Phase 4 — Command registry
//
// The single source of truth for every action family the spine accepts.
// The validator rejects anything not in this list. New action families do
// not become reachable until a registry entry exists AND a Tauri command
// backs it (see Rust executor.rs).

import type { IntentVerb } from "../resolver/phraseGrammar";

export type ActionKind =
  | "app.open"
  | "app.quit"
  | "app.hide"
  | "app.focus"
  | "folder.open"
  | "service.open"
  | "settings.open"
  | "volume.set"
  | "volume.mute"
  | "volume.unmute"
  | "volume.step_up"
  | "volume.step_down";

export type RequiredField =
  | "path"
  | "url"
  | "identifier"
  | "bundle_id"
  | "numeric_arg";

export interface RegistryEntry {
  action: ActionKind;
  // Phase 3 target_kind values that map to this action.
  targetKinds: ReadonlyArray<string>;
  // Intent verbs that map to this action when paired with one of targetKinds.
  intents: ReadonlyArray<IntentVerb>;
  // Fields required on PreviewTargetRef before the action is executable.
  required: ReadonlyArray<RequiredField>;
  // True only when a real native command surface backs this action.
  executable: boolean;
}

export const COMMAND_REGISTRY: ReadonlyArray<RegistryEntry> = [
  {
    action: "app.open",
    targetKinds: ["app"],
    intents: ["open"],
    required: ["path"],
    executable: true,
  },
  {
    action: "app.quit",
    targetKinds: ["app"],
    intents: ["quit"],
    required: ["bundle_id"],
    executable: true,
  },
  {
    action: "app.hide",
    targetKinds: ["app"],
    intents: ["hide"],
    required: ["bundle_id"],
    executable: true,
  },
  {
    action: "app.focus",
    targetKinds: ["app"],
    intents: ["focus"],
    required: ["bundle_id"],
    executable: true,
  },
  {
    action: "folder.open",
    targetKinds: ["folder", "volume"],
    intents: ["open"],
    required: ["path"],
    executable: true,
  },
  {
    action: "service.open",
    targetKinds: ["service"],
    intents: ["open"],
    required: ["url"],
    executable: true,
  },
  {
    action: "settings.open",
    targetKinds: ["settings_pane"],
    intents: ["open"],
    required: ["url"],
    executable: true,
  },
  {
    action: "volume.set",
    targetKinds: ["system_audio"],
    intents: ["volume_set"],
    required: ["numeric_arg"],
    executable: true,
  },
  {
    action: "volume.mute",
    targetKinds: ["system_audio"],
    intents: ["volume_mute"],
    required: [],
    executable: true,
  },
  {
    action: "volume.unmute",
    targetKinds: ["system_audio"],
    intents: ["volume_unmute"],
    required: [],
    executable: true,
  },
  {
    action: "volume.step_up",
    targetKinds: ["system_audio"],
    intents: ["volume_up"],
    required: [],
    executable: true,
  },
  {
    action: "volume.step_down",
    targetKinds: ["system_audio"],
    intents: ["volume_down"],
    required: [],
    executable: true,
  },
];

export function findEntry(action: ActionKind): RegistryEntry | undefined {
  return COMMAND_REGISTRY.find((e) => e.action === action);
}

// Resolves the (intent, target_kind) pair to an ActionKind. Returns null
// when no registry entry covers the pair, which the validator surfaces as
// a typed guidance state (typically needs_more or unsupported_yet).
export function actionFromIntentAndKind(
  intent: IntentVerb,
  targetKind: string,
): ActionKind | null {
  for (const entry of COMMAND_REGISTRY) {
    if (
      entry.intents.includes(intent) &&
      entry.targetKinds.includes(targetKind)
    ) {
      return entry.action;
    }
  }
  return null;
}

// Legacy single-arg shim retained for parser back-compat. Treats the absence
// of an explicit intent as the default "open" verb so bare-noun inputs continue
// to resolve to app.open / folder.open / service.open / settings.open.
export function actionFromTargetKind(targetKind: string): ActionKind | null {
  return actionFromIntentAndKind("open", targetKind);
}
