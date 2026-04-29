// Phase 4 — Approval gate
//
// Mechanical mapping from RiskLevel to ApprovalDecision. The "needs_approval"
// state is a typed pause point — Phase 5 will surface it as approval UI.
// For this slice, callers treat anything other than auto_approved as a stop.

import type { RiskAssessment } from "./risk";

export type ApprovalDecision =
  | { kind: "auto_approved" }
  | { kind: "needs_approval"; reason: string }
  | { kind: "rejected"; reason: string };

export function approve(risk: RiskAssessment): ApprovalDecision {
  switch (risk.level) {
    case "safe":
      return { kind: "auto_approved" };
    case "attention":
      return { kind: "needs_approval", reason: risk.reason };
    case "blocked":
      return { kind: "rejected", reason: risk.reason };
  }
}
