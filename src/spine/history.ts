// Phase 4/5 — History
//
// One in-memory append-only log of every spine attempt, including those
// rejected before execution. This is the audit trail the contract requires
// at the trust layer.
//
// Phase 4/5 scope: in-memory only. Records are lost on app/window reload
// or process restart. Persistence and inspection UI belong to Phase 5+.

import type { ParsedCommand } from "./parser";
import type { ValidationStatus } from "./validator";
import type { RiskAssessment } from "./risk";
import type { ApprovalDecision } from "./approve";
import type { ExecutionOutcome } from "./executor";
import type { GovernorDecision } from "./governor";

export interface HistoryRecord {
  id: string;
  timestamp: string;
  raw_input: string;
  action: ParsedCommand["action"];
  target_label: string | null;
  validation: ValidationStatus;
  governor: GovernorDecision | null;
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
