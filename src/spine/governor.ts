// Phase 5 groundwork — Command Governor
//
// The validator is intentionally structural. This layer is contextual: it
// distrusts resolver output, checks the command against available Mac state,
// attaches risk/approval/undo policy, and returns precise recovery guidance.
//
// No execution happens here. The governor decides whether execution may be
// attempted after the structural validator has passed.

import type { NativeEnvironmentSnapshot, RunningApp } from "../types/nativeEnvironment";
import type { ParsedCommand } from "./parser";
import type { ValidationStatus, GuidanceState } from "./validator";
import { assessRisk, type RiskAssessment } from "./risk";
import { approve, type ApprovalDecision } from "./approve";
import { undoPolicyFor, type UndoPolicy } from "./undoPolicy";

export type GovernorStatus = "allow" | "gate" | "block";

export interface GovernorDecision {
  status: GovernorStatus;
  guidance: GuidanceState | null;
  reason: string;
  recovery: string | null;
  risk: RiskAssessment;
  approval: ApprovalDecision;
  undo_policy: UndoPolicy;
}

function hasSafeHttpUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("https://") || url.startsWith("http://");
}

function hasSystemSettingsUrl(url: string | undefined): boolean {
  return Boolean(url && url.startsWith("x-apple.systempreferences:"));
}

function appIsRunning(snapshot: NativeEnvironmentSnapshot | null, bundleId: string | null | undefined): boolean | null {
  if (!bundleId || !snapshot) return null;
  const reading = snapshot.live_runtime_state.running_apps;
  if (reading.kind !== "available") return null;
  return reading.data.some((app: RunningApp) => app.bundle_id === bundleId);
}

function appIsLaunchable(cmd: ParsedCommand): boolean {
  return Boolean(cmd.target_ref?.path && cmd.prediction.source !== "live_runtime_state");
}

function audioOutputKnown(snapshot: NativeEnvironmentSnapshot | null): boolean | null {
  if (!snapshot) return null;
  const reading = snapshot.live_runtime_state.audio_input_output_devices;
  if (reading.kind !== "available") return null;
  return reading.data.output.length > 0;
}

// Distrust resolver confidence: a contains-tier match near the threshold
// may be wrong. Gate it so the user must explicitly confirm (Phase 5 inline
// approval) instead of auto-executing.
const CONTAINS_SOFT_CEILING = 0.65;

function isWeakContainsMatch(cmd: ParsedCommand): boolean {
  const p = cmd.prediction;
  return p.confidence_tier === "contains" && p.confidence < CONTAINS_SOFT_CEILING;
}

function appIsFrontmost(snapshot: NativeEnvironmentSnapshot | null, bundleId: string | null | undefined): boolean | null {
  if (!bundleId || !snapshot) return null;
  const reading = snapshot.live_runtime_state.frontmost_app;
  if (reading.kind !== "available" || !reading.data) return null;
  return reading.data.bundle_id === bundleId;
}

function baseDecision(
  cmd: ParsedCommand,
  status: GovernorStatus,
  guidance: GuidanceState | null,
  reason: string,
  recovery: string | null,
): GovernorDecision {
  const risk = assessRisk(cmd);
  const approval = approve(risk);
  const undo_policy = undoPolicyFor(cmd.action);
  return { status, guidance, reason, recovery, risk, approval, undo_policy };
}

function block(
  cmd: ParsedCommand,
  guidance: GuidanceState,
  reason: string,
  recovery: string | null,
): GovernorDecision {
  const d = baseDecision(cmd, "block", guidance, reason, recovery);
  if (d.risk.level !== "blocked") {
    d.risk = { level: "blocked", reason };
    d.approval = { kind: "rejected", reason };
  }
  return d;
}

function allow(cmd: ParsedCommand): GovernorDecision {
  const risk = assessRisk(cmd);
  const approval = approve(risk);
  const undo_policy = undoPolicyFor(cmd.action);
  const status: GovernorStatus = approval.kind === "auto_approved" ? "allow" : "gate";
  const guidance: GuidanceState | null =
    approval.kind === "needs_approval" ? "approval_needed" :
    approval.kind === "rejected" ? "blocked" :
    null;
  const recovery =
    approval.kind === "needs_approval" ? "Confirm before executing." : null;
  return {
    status,
    guidance,
    reason: risk.reason,
    recovery,
    risk,
    approval,
    undo_policy,
  };
}

export function governCommand(
  cmd: ParsedCommand,
  validation: ValidationStatus,
  snapshot: NativeEnvironmentSnapshot | null,
): GovernorDecision {
  if (validation.kind === "invalid") {
    return block(cmd, validation.guidance, validation.reason, null);
  }

  // Cross-cutting confidence distrust: a contains-tier match near the
  // execution threshold may be a false positive. Gate it instead of
  // auto-executing. The user sees "Be more specific" or similar guidance.
  if (isWeakContainsMatch(cmd)) {
    return baseDecision(
      cmd,
      "gate",
      "choose_one",
      "low-confidence contains match requires confirmation",
      "Be more specific or press Enter again to confirm.",
    );
  }

  switch (cmd.action) {
    case "app.open": {
      if (!appIsLaunchable(cmd)) {
        return block(
          cmd,
          "needs_more",
          "app.open requires a launchable static app path, not a live-runtime-only app",
          "Try focus or quit for a running app, or open the installed app by name.",
        );
      }
      return allow(cmd);
    }

    case "app.quit":
    case "app.hide": {
      const running = appIsRunning(snapshot, cmd.target_ref?.bundle_id);
      if (running === false) {
        return block(
          cmd,
          "unsupported_yet",
          `${cmd.action} requires the app to be running`,
          `${cmd.target_ref?.label ?? "That app"} is not running.`,
        );
      }
      return allow(cmd);
    }

    case "app.focus": {
      const running = appIsRunning(snapshot, cmd.target_ref?.bundle_id);
      if (running === false) {
        return block(
          cmd,
          "unsupported_yet",
          "app.focus requires the app to be running",
          `Try opening ${cmd.target_ref?.label ?? "the app"} first.`,
        );
      }
      // If the app is already frontmost, allow the command but it will be a
      // no-op. A future slice can surface "Already focused" guidance here.
      const frontmost = appIsFrontmost(snapshot, cmd.target_ref?.bundle_id);
      if (frontmost === true) {
        return baseDecision(
          cmd,
          "allow",
          null,
          `${cmd.target_ref?.label ?? "app"} is already the frontmost app`,
          null,
        );
      }
      return allow(cmd);
    }

    case "service.open": {
      if (!hasSafeHttpUrl(cmd.target_ref?.url)) {
        return block(
          cmd,
          "blocked",
          "service.open requires an http(s) URL",
          "Only browser-safe service URLs are allowed.",
        );
      }
      return allow(cmd);
    }

    case "settings.open": {
      if (!hasSystemSettingsUrl(cmd.target_ref?.url)) {
        return block(
          cmd,
          "blocked",
          "settings.open requires an x-apple.systempreferences URL",
          "Use a known System Settings pane.",
        );
      }
      return allow(cmd);
    }

    case "volume.set": {
      const n = cmd.target_ref?.numeric_arg;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100) {
        return block(
          cmd,
          "needs_more",
          "volume.set requires a finite level from 0 to 100",
          "Use a number from 0 to 100.",
        );
      }
      const known = audioOutputKnown(snapshot);
      if (known === false) {
        return block(
          cmd,
          "unsupported_yet",
          "no default audio output device is available",
          "Connect or select an output device first.",
        );
      }
      return allow(cmd);
    }

    case "volume.mute":
    case "volume.unmute":
    case "volume.step_up":
    case "volume.step_down": {
      const known = audioOutputKnown(snapshot);
      if (known === false) {
        return block(
          cmd,
          "unsupported_yet",
          "no default audio output device is available",
          "Connect or select an output device first.",
        );
      }
      return allow(cmd);
    }

    case "folder.open": {
      if (!cmd.target_ref?.path) {
        return block(cmd, "needs_more", "folder.open requires a path", "Choose a folder target.");
      }
      return allow(cmd);
    }

    case "unknown":
      return block(cmd, "blocked", "unknown action", null);
  }
}
