// Phase 4/5 — Spine orchestrator
//
// One entry: takes a PreviewPrediction, runs every stage in fixed order,
// records the outcome, and returns it. No multi-step orchestration, no
// planner, no provider call — a single command attempt end to end.
//
//   parser → validator → governor → executor → history

import type { NativeEnvironmentSnapshot } from "../types/nativeEnvironment";
import type { PreviewPrediction } from "../resolver/previewResolver";
import { parseCommand, type ParsedCommand } from "./parser";
import { validateCommand, type ValidationStatus } from "./validator";
import type { RiskAssessment } from "./risk";
import type { ApprovalDecision } from "./approve";
import { executeCommand, type ExecutionOutcome } from "./executor";
import { governCommand, type GovernorDecision } from "./governor";
import { recordAttempt, type HistoryRecord } from "./history";

export interface SpineOutcome {
  parsed: ParsedCommand;
  validation: ValidationStatus;
  governor: GovernorDecision;
  risk: RiskAssessment | null;
  approval: ApprovalDecision | null;
  execution: ExecutionOutcome | null;
  record: HistoryRecord;
}

export async function runSpine(
  prediction: PreviewPrediction,
  snapshot: NativeEnvironmentSnapshot | null = null,
): Promise<SpineOutcome> {
  const parsed = parseCommand(prediction);
  const validation = validateCommand(parsed);
  const governor = governCommand(parsed, validation, snapshot);
  const targetLabel = parsed.target_ref?.label ?? null;

  if (governor.status !== "allow") {
    const record = recordAttempt({
      raw_input: parsed.raw_input,
      action: parsed.action,
      target_label: targetLabel,
      validation,
      governor,
      risk: governor.risk,
      approval: governor.approval,
      execution: null,
    });
    return {
      parsed,
      validation,
      governor,
      risk: governor.risk,
      approval: governor.approval,
      execution: null,
      record,
    };
  }

  const execution = await executeCommand(parsed);
  const record = recordAttempt({
    raw_input: parsed.raw_input,
    action: parsed.action,
    target_label: targetLabel,
    validation,
    governor,
    risk: governor.risk,
    approval: governor.approval,
    execution,
  });

  return {
    parsed,
    validation,
    governor,
    risk: governor.risk,
    approval: governor.approval,
    execution,
    record,
  };
}
