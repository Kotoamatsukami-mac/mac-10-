// Phase 4 — Parser
//
// Adapts the Phase 3 PreviewPrediction (already action-stripped + resolved)
// into a ParsedCommand the rest of the spine consumes. No re-resolution,
// no native probing. The (intent, target_kind) pair is what binds the user's
// classified verb to a registered ActionKind.

import type {
  PreviewPrediction,
  PreviewTargetRef,
} from "../resolver/previewResolver";
import { actionFromIntentAndKind, type ActionKind } from "./registry";

export interface ParsedCommand {
  raw_input: string;
  action: ActionKind | "unknown";
  target_ref: PreviewTargetRef | null;
  prediction: PreviewPrediction;
}

export function parseCommand(prediction: PreviewPrediction): ParsedCommand {
  const action = actionFromIntentAndKind(
    prediction.intent,
    prediction.target_kind,
  );
  return {
    raw_input: prediction.raw_input,
    action: action ?? "unknown",
    target_ref: prediction.target_ref ?? null,
    prediction,
  };
}
