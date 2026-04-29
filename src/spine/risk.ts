// Phase 4 — Risk classifier
//
// Three levels for this slice: safe / attention / blocked. No destructive
// operations are reachable, so the surface is simple — open-style actions
// are safe, audio mutation is attention, anything unknown is blocked.

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
        level: "attention",
        reason: "modifies system audio output",
      };
    case "unknown":
      return {
        level: "blocked",
        reason: "unknown action",
      };
  }
}
