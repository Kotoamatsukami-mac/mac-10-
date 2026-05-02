// Phase 4/5 — Outcome message mapping
//
// Pure mapping from resolveNow / SpineOutcome shapes to a minimal StripStatus
// rendered in the existing input-stack overlay. No provider logic, no second
// spine, no raw enum/user-hostile failure strings.

import type { ResolveNowResult } from "../hooks/usePreviewPrediction";
import type { GuidanceState } from "./validator";
import type { ActionKind } from "./registry";
import type { SpineOutcome } from "./runSpine";

export type StripStatus =
  | { kind: "idle" }
  | { kind: "ok"; msg: string }
  | { kind: "hint"; msg: string }
  | { kind: "blocked"; msg: string };

export function shortLabel(label: string | null | undefined): string {
  if (!label) return "";
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3) return words.join(" ");
  return words.slice(0, 3).join(" ") + "…";
}

function guidanceStatus(guidance: GuidanceState): StripStatus {
  switch (guidance) {
    case "needs_more":
      return { kind: "hint", msg: "Keep typing" };
    case "choose_one":
      return { kind: "hint", msg: "Be more specific" };
    case "permission_needed":
      return { kind: "hint", msg: "Needs permission" };
    case "approval_needed":
      return { kind: "hint", msg: "Needs confirm" };
    case "unsupported_yet":
      return { kind: "hint", msg: "Not available yet" };
    case "blocked":
      return { kind: "blocked", msg: "Not allowed" };
  }
}

function governorStatus(outcome: SpineOutcome): StripStatus | null {
  const g = outcome.governor;
  if (!g) {
    // Compatibility for older unit fixtures that focus only on validation,
    // approval, or executor mapping. Real runSpine outcomes always include a
    // governor decision.
    const v = outcome.validation;
    if (v.kind === "invalid") return guidanceStatus(v.guidance);
    if (outcome.approval?.kind === "needs_approval") {
      return { kind: "hint", msg: "Confirm" };
    }
    if (outcome.approval?.kind === "rejected") {
      return { kind: "blocked", msg: "Blocked" };
    }
    return null;
  }

  if (g.status === "allow") return null;

  // Prefer precise, short recovery copy where the governor can provide it.
  // Keep it strip-safe: one line, no raw enum strings.
  if (g.recovery) {
    const msg = shortLabel(g.recovery);
    return { kind: g.status === "block" ? "blocked" : "hint", msg };
  }

  if (g.guidance) return guidanceStatus(g.guidance);

  return {
    kind: g.status === "block" ? "blocked" : "hint",
    msg: g.status === "block" ? "Not allowed" : "Confirm",
  };
}

// Past-tense verb shown next to the target on a successful action.
// Volume actions are special-cased in the caller because they format the
// numeric argument inline.
function okVerbFor(action: ActionKind | "unknown"): string {
  switch (action) {
    case "app.open":
    case "folder.open":
    case "service.open":
    case "settings.open":
      return "Opened";
    case "app.quit":
      return "Quit";
    case "app.hide":
      return "Hid";
    case "app.focus":
      return "Focused";
    case "volume.mute":
      return "Muted";
    case "volume.unmute":
      return "Unmuted";
    case "volume.step_up":
    case "volume.step_down":
    case "volume.set":
      // volume.set is special-cased; step_up/step_down fall through to a
      // generic label in the rare case the caller doesn't override.
      return "Set";
    case "unknown":
      return "Done";
  }
}

export function statusFromResolveNow(
  result: ResolveNowResult,
): StripStatus | null {
  if (result.kind === "unavailable") {
    return { kind: "hint", msg: "Index unavailable" };
  }
  // resolvePreview() returns null only when the normalized input is empty.
  // no_match still returns a prediction and flows through the spine validator.
  if (!result.prediction) {
    return { kind: "hint", msg: "Type more" };
  }
  return null;
}

export function statusFromOutcome(outcome: SpineOutcome): StripStatus {
  const governed = governorStatus(outcome);
  if (governed) return governed;

  if (outcome.execution) {
    if (outcome.execution.kind === "ok") {
      const label =
        outcome.parsed.target_ref?.label ??
        outcome.parsed.prediction.display_label;
      const trimmed = shortLabel(label);
      console.assert(Boolean(trimmed), "ok outcome missing display label");
      const verb = okVerbFor(outcome.parsed.action);
      const msg =
        outcome.parsed.action === "volume.set"
          ? `Volume ${outcome.parsed.target_ref?.numeric_arg ?? trimmed}`
          : `${verb} ${trimmed}`;
      return { kind: "ok", msg };
    }
    // Map typed executor errors to precise user guidance
    const errorKind =
      "error_kind" in outcome.execution
        ? (outcome.execution as { error_kind: string }).error_kind
        : "unknown";
    switch (errorKind) {
      case "path_not_found":
        return { kind: "hint", msg: "Not found" };
      case "disallowed_scheme":
        return { kind: "blocked", msg: "Not allowed" };
      case "open_failed":
        return { kind: "hint", msg: "Couldn't open" };
      case "app_not_running":
        return { kind: "hint", msg: "Not running" };
      case "app_not_found":
        return { kind: "hint", msg: "Not found" };
      case "audio_unavailable":
        return { kind: "hint", msg: "Audio unavailable" };
      default:
        return { kind: "hint", msg: "Try again" };
    }
  }

  return { kind: "hint", msg: "Try again" };
}
