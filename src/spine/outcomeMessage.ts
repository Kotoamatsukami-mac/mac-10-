// Phase 4 Slice 2 — Outcome message mapping
//
// Pure mapping from resolveNow / SpineOutcome shapes to a minimal StripStatus
// rendered in the existing input-stack overlay. No formatting beyond the rules
// below; no provider logic; no second spine.

import type { ResolveNowResult } from "../hooks/usePreviewPrediction";
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
  const v = outcome.validation;
  if (v.kind === "invalid") {
    switch (v.guidance) {
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

  if (outcome.approval) {
    switch (outcome.approval.kind) {
      case "needs_approval":
        return { kind: "hint", msg: "Confirm" };
      case "rejected":
        return { kind: "blocked", msg: "Blocked" };
      case "auto_approved":
        break;
    }
  }

  if (outcome.execution) {
    if (outcome.execution.kind === "ok") {
      const label =
        outcome.parsed.target_ref?.label ??
        outcome.parsed.prediction.display_label;
      const trimmed = shortLabel(label);
      console.assert(Boolean(trimmed), "ok outcome missing display label");
      return {
        kind: "ok",
        msg: `Opened ${trimmed}`,
      };
    }
    return { kind: "hint", msg: "Try again" };
  }

  return { kind: "hint", msg: "Try again" };
}
