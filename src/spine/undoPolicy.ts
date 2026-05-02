// Phase 5 groundwork — Undo policy
//
// This is not durable undo yet. It is the contract that every ActionKind must
// declare before the history layer can safely grow inverse actions. The policy
// is intentionally boring and explicit: no command gets to pretend it is
// reversible just because execution succeeded.

import type { ActionKind } from "./registry";

export type UndoClass =
  | "reversible"
  | "partially_reversible"
  | "not_reversible"
  | "blocked";

export interface UndoPolicy {
  action: ActionKind | "unknown";
  undo_class: UndoClass;
  reason: string;
  requires_pre_state: boolean;
}

const POLICY_BY_ACTION: Record<ActionKind, Omit<UndoPolicy, "action">> = {
  "app.open": {
    undo_class: "partially_reversible",
    reason: "can sometimes close or refocus away, but app launch may create state",
    requires_pre_state: true,
  },
  "app.quit": {
    undo_class: "not_reversible",
    reason: "relaunching cannot restore unsaved app state",
    requires_pre_state: true,
  },
  "app.hide": {
    undo_class: "partially_reversible",
    reason: "can refocus the app, but previous window/user focus may differ",
    requires_pre_state: true,
  },
  "app.focus": {
    undo_class: "partially_reversible",
    reason: "can restore previous frontmost app if captured before execution",
    requires_pre_state: true,
  },
  "folder.open": {
    undo_class: "partially_reversible",
    reason: "Finder/window focus can change but previous layout is not guaranteed",
    requires_pre_state: true,
  },
  "service.open": {
    undo_class: "partially_reversible",
    reason: "browser navigation may be reversible only with browser state",
    requires_pre_state: true,
  },
  "settings.open": {
    undo_class: "partially_reversible",
    reason: "previous frontmost app can be restored if captured",
    requires_pre_state: true,
  },
  "volume.set": {
    undo_class: "reversible",
    reason: "previous output volume can be restored if captured before execution",
    requires_pre_state: true,
  },
  "volume.mute": {
    undo_class: "reversible",
    reason: "previous mute/volume state can be restored if captured before execution",
    requires_pre_state: true,
  },
  "volume.unmute": {
    undo_class: "reversible",
    reason: "previous mute/volume state can be restored if captured before execution",
    requires_pre_state: true,
  },
  "volume.step_up": {
    undo_class: "reversible",
    reason: "previous output volume can be restored if captured before execution",
    requires_pre_state: true,
  },
  "volume.step_down": {
    undo_class: "reversible",
    reason: "previous output volume can be restored if captured before execution",
    requires_pre_state: true,
  },
};

export function undoPolicyFor(action: ActionKind | "unknown"): UndoPolicy {
  if (action === "unknown") {
    return {
      action,
      undo_class: "blocked",
      reason: "unknown actions are never executable or reversible",
      requires_pre_state: false,
    };
  }

  return {
    action,
    ...POLICY_BY_ACTION[action],
  };
}

export function allUndoPolicies(): UndoPolicy[] {
  return Object.keys(POLICY_BY_ACTION).map((action) =>
    undoPolicyFor(action as ActionKind),
  );
}
