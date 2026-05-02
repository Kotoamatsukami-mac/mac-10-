// Phase 4 — Risk classifier
//
// Three levels: safe / attention / blocked. Open-style and focus-style
// actions are reversible (relaunch, unhide, refocus, raise volume back).
// All volume actions are clamped 0..100 at the resolver boundary, so they
// are bounded and reversible too. No destructive operations are reachable.

import type { ParsedCommand } from "./parser";

export type RiskLevel = "safe" | "attention" | "blocked";

export interface RiskAssessment {
  level: RiskLevel;
  reason: string;
}

export function assessRisk(cmd: ParsedCommand): RiskAssessment {
  switch (cmd.action) {
    case "app.open":
      return {
        level: "safe",
        reason: "launches an installed application via LaunchServices",
      };
    case "app.quit":
      return {
        level: "attention",
        reason:
          "terminates a running app; may interrupt unsaved work",
      };
    case "app.hide":
      return {
        level: "safe",
        reason: "hides a running app's windows; reversible by refocusing",
      };
    case "app.focus":
      return {
        level: "safe",
        reason: "brings a running app to the front",
      };
    case "folder.open":
      return {
        level: "safe",
        reason: "opens a directory in Finder",
      };
    case "service.open":
      return {
        level: "safe",
        reason: "opens a URL in the default browser",
      };
    case "settings.open":
      return {
        level: "safe",
        reason: "opens a System Settings pane",
      };
    case "volume.set":
      return {
        level: "safe",
        reason: "sets system audio output level (clamped 0..100)",
      };
    case "volume.mute":
    case "volume.unmute":
      return {
        level: "safe",
        reason: "toggles system audio mute state",
      };
    case "volume.step_up":
    case "volume.step_down":
      return {
        level: "safe",
        reason: "steps system audio output level by a fixed increment",
      };
    case "unknown":
      return {
        level: "blocked",
        reason: "unknown action",
      };
  }
}
