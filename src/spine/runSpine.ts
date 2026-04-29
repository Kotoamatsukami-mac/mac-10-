// Phase 4 — Spine orchestrator
//
// One entry: takes a PreviewPrediction, runs every stage in fixed order,
// records the outcome, and returns it. No multi-step orchestration, no
// planner, no provider call — a single command attempt end to end.
//
//   parser → validator → risk → approve → executor → history

import type { PreviewPrediction } from "../resolver/previewResolver";
import { parseCommand, type ParsedCommand } from "./parser";
import { validateCommand, type ValidationStatus } from "./validator";
import { assessRisk, type RiskAssessment } from "./risk";
import { approve, type ApprovalDecision } from "./approve";
import { executeCommand, type ExecutionOutcome } from "./executor";
import { recordAttempt, type HistoryRecord } from "./history";

export interface SpineOutcome {
  parsed: ParsedCommand;
  validation: ValidationStatus;
  risk: RiskAssessment | null;
  approval: ApprovalDecision | null;
  execution: ExecutionOutcome | null;
  record: HistoryRecord;
}

export async function runSpine(
  prediction: PreviewPrediction,
): Promise<SpineOutcome> {
  const parsed = parseCommand(prediction);
  const validation = validateCommand(parsed);
  const targetLabel = parsed.target_ref?.label ?? null;

  if (validation.kind === "invalid") {
    const record = recordAttempt({
      raw_input: parsed.raw_input,
      action: parsed.action,
      target_label: targetLabel,
      validation,
      risk: null,
      approval: null,
      execution: null,
    });
    return {
      parsed,
      validation,
      risk: null,
      approval: null,
      execution: null,
      record,
    };
  }

  const risk = assessRisk(parsed);
  const approval = approve(risk);

  if (approval.kind !== "auto_approved") {
    const record = recordAttempt({
      raw_input: parsed.raw_input,
      action: parsed.action,
      target_label: targetLabel,
      validation,
      risk,
      approval,
      execution: null,
    });
    return {
      parsed,
      validation,
      risk,
      approval,
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
    risk,
    approval,
    execution,
  });

  return { parsed, validation, risk, approval, execution, record };
}
