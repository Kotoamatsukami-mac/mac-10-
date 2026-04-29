// Phase 4 — History
//
// One in-memory append-only log of every spine attempt, including those
// rejected before execution. This is the audit trail the contract requires
// at the trust layer; later slices can persist it.

import type { ParsedCommand } from "./parser";
import type { ValidationStatus } from "./validator";
import type { RiskAssessment } from "./risk";
import type { ApprovalDecision } from "./approve";
import type { ExecutionOutcome } from "./executor";

export interface HistoryRecord {
  id: string;
  timestamp: string;
  raw_input: string;
  action: ParsedCommand["action"];
  target_label: string | null;
  validation: ValidationStatus;
  risk: RiskAssessment | null;
  approval: ApprovalDecision | null;
  execution: ExecutionOutcome | null;
}

const records: HistoryRecord[] = [];

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function recordAttempt(
  draft: Omit<HistoryRecord, "id" | "timestamp">,
): HistoryRecord {
  const record: HistoryRecord = {
    id: nextId(),
    timestamp: new Date().toISOString(),
    ...draft,
  };
  records.push(record);
  return record;
}

export function getHistory(): readonly HistoryRecord[] {
  return records;
}
