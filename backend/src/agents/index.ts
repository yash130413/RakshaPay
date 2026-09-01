import { detectRevenueRiskRules } from "./rules.js";
import { diagnoseFailure } from "./diagnosis.agent.js";
import { chooseRecoveryStrategy } from "./strategy.agent.js";
import type {
  DiagnosisResult,
  RiskResult,
  StrategyResult,
  VerifyResult,
} from "./types.js";

export type {
  DiagnosisResult,
  RiskResult,
  StrategyResult,
  VerifyResult,
} from "./types.js";

export { isLlmConfigured } from "./llm.client.js";

/**
 * Agent 1 — Is this actually revenue at risk?
 */
export async function detectRevenueRisk(input: {
  eventType: string;
  amount: number;
  status?: string;
}): Promise<RiskResult> {
  return detectRevenueRiskRules(input);
}

export { diagnoseFailure, chooseRecoveryStrategy };

/**
 * Agent 4 — Verify recovery after Razorpay webhook.
 */
export async function verifyRecovery(input: {
  eventType: string;
  amount: number;
  expectedAmountPaise?: number;
  recoveryCaseId?: string | null;
  noteCaseId?: string | null;
}): Promise<VerifyResult> {
  if (input.eventType !== "payment.captured") {
    return {
      success: false,
      recoveredAmount: 0,
      notes: "No capture event — recovery not confirmed",
      checks: { eventValid: false, amountMatch: false, caseLinked: false },
    };
  }

  const amountMatch =
    input.expectedAmountPaise == null || input.amount === input.expectedAmountPaise;

  const caseLinked = Boolean(input.recoveryCaseId);
  const noteMatches =
    !input.noteCaseId ||
    !input.recoveryCaseId ||
    input.noteCaseId === input.recoveryCaseId;

  const success = amountMatch && caseLinked && noteMatches;

  const notes = !caseLinked
    ? "Capture received but no matching open recovery case"
    : !amountMatch
      ? `Amount mismatch: expected ₹${(input.expectedAmountPaise ?? 0) / 100}, got ₹${input.amount / 100}`
      : !noteMatches
        ? "Recovery case id in payment notes did not match matched case"
        : "Payment captured and matched to recovery case";

  return {
    success,
    recoveredAmount: success ? input.amount : 0,
    notes,
    checks: {
      eventValid: true,
      amountMatch,
      caseLinked: caseLinked && noteMatches,
    },
  };
}
