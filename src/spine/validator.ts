// Phase 4 — Validator
//
// Rejects anything not in the registry, anything missing required fields on
// the resolved target, anything below the confidence threshold, and any
// ambiguous resolution. Maps every rejection to a single GuidanceState from
// the contract.

import type { PreviewTargetRef } from "../resolver/previewResolver";
import type { ParsedCommand } from "./parser";
import { findEntry, type RequiredField } from "./registry";

export type GuidanceState =
  | "needs_more"
  | "choose_one"
  | "permission_needed"
  | "approval_needed"
  | "unsupported_yet"
  | "blocked";

export type ValidationStatus =
  | { kind: "valid" }
  | { kind: "invalid"; guidance: GuidanceState; reason: string };

// Execution confidence floor — distinct from the ghost-display threshold
// (0.28) in src/App.tsx.
const CONTAINS_THRESHOLD = 0.5;

function fieldValue(
  ref: PreviewTargetRef,
  field: RequiredField,
): string | number | null | undefined {
  switch (field) {
    case "path":
      return ref.path;
    case "url":
      return ref.url;
    case "identifier":
      return ref.identifier;
    case "bundle_id":
      return ref.bundle_id;
    case "numeric_arg":
      return ref.numeric_arg;
  }
}

function isPresent(v: string | number | null | undefined): boolean {
  // 0 is a valid numeric_arg (volume 0 = silence). Treat null/undefined/empty
  // string as missing; treat any finite number as present.
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return Number.isFinite(v);
  return v.length > 0;
}

export function validateCommand(cmd: ParsedCommand): ValidationStatus {
  if (cmd.action === "unknown") {
    return {
      kind: "invalid",
      guidance: "needs_more",
      reason: "no action resolved from input",
    };
  }

  const entry = findEntry(cmd.action);
  if (!entry) {
    return {
      kind: "invalid",
      guidance: "blocked",
      reason: `action ${cmd.action} not in registry`,
    };
  }

  if (!entry.executable) {
    return {
      kind: "invalid",
      guidance: "unsupported_yet",
      reason: `${cmd.action} not yet wired to a native command`,
    };
  }

  if (!cmd.target_ref) {
    return {
      kind: "invalid",
      guidance: "needs_more",
      reason: "no target resolved",
    };
  }

  for (const field of entry.required) {
    const v = fieldValue(cmd.target_ref, field);
    if (!isPresent(v)) {
      return {
        kind: "invalid",
        guidance: "needs_more",
        reason: `target_ref missing ${field}`,
      };
    }
  }

  switch (cmd.prediction.confidence_tier) {
    case "ambiguous":
      return {
        kind: "invalid",
        guidance: "choose_one",
        reason: "multiple candidates tied at the top",
      };
    case "no_match":
      return {
        kind: "invalid",
        guidance: "needs_more",
        reason: "no match",
      };
    case "fuzzy":
      return {
        kind: "invalid",
        guidance: "needs_more",
        reason: "fuzzy tier not enabled",
      };
    case "contains":
      if (cmd.prediction.confidence < CONTAINS_THRESHOLD) {
        return {
          kind: "invalid",
          guidance: "needs_more",
          reason: "low-confidence contains match",
        };
      }
      break;
    case "exact":
    case "prefix":
      break;
  }

  return { kind: "valid" };
}
