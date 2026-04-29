// Phase 4 — Parser
//
// Adapts the Phase 3 PreviewPrediction (already action-stripped + resolved)
// into a ParsedCommand the rest of the spine consumes. No re-resolution,
// no native probing.

import type {
  PreviewPrediction,
  PreviewTargetRef,
} from "../resolver/previewResolver";
import { actionFromTargetKind, type ActionKind } from "./registry";

export interface ParsedCommand {
  raw_input: string;
  action: ActionKind | "unknown";
  target_ref: PreviewTargetRef | null;
  prediction: PreviewPrediction;
}

export function parseCommand(prediction: PreviewPrediction): ParsedCommand {
  const action = actionFromTargetKind(prediction.target_kind);
  return {
    raw_input: prediction.raw_input,
    action: action ?? "unknown",
    target_ref: prediction.target_ref ?? null,
    prediction,
  };
}
