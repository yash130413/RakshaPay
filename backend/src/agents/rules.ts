import type { RecoveryActionType } from "@prisma/client";
import type { DiagnosisResult, RiskResult, StrategyResult } from "./types.js";

export function detectRevenueRiskRules(input: {
  eventType: string;
  amount: number;
}): RiskResult {
  if (input.eventType === "payment.failed") {
    return {
      isRevenueAtRisk: true,
      reason: "Payment failed — revenue at risk",
      confidence: 0.95,
      source: "rules",
    };
  }

  if (input.eventType === "payment.captured") {
    return {
      isRevenueAtRisk: false,
      reason: "Payment already captured",
      confidence: 0.99,
      source: "rules",
    };
  }

  return {
    isRevenueAtRisk: input.amount > 0,
    reason: "Unknown event — treat as potential risk",
    confidence: 0.4,
    source: "rules",
  };
}

export function diagnoseFailureRules(input: {
  failureReason?: string | null;
}): DiagnosisResult {
  const reason = (input.failureReason ?? "").toLowerCase();

  if (reason.includes("insufficient")) {
    return {
      diagnosis: "temporary_payment_failure",
      confidence: 0.88,
      failureCategory: "insufficient_funds",
      source: "rules",
    };
  }

  if (reason.includes("expired")) {
    return {
      diagnosis: "expired_payment_method",
      confidence: 0.92,
      failureCategory: "expired_card",
      source: "rules",
    };
  }

  if (reason.includes("international")) {
    return {
      diagnosis: "international_card_blocked",
      confidence: 0.9,
      failureCategory: "international_transaction_not_allowed",
      source: "rules",
    };
  }

  return {
    diagnosis: "generic_payment_failure",
    confidence: 0.7,
    failureCategory: reason || "unknown",
    source: "rules",
  };
}

export function chooseRecoveryStrategyRules(input: {
  diagnosis: string;
  amount: number;
  previousAttempts: number;
  successfulPayments: number;
}): StrategyResult {
  if (
    input.diagnosis === "expired_payment_method" ||
    input.diagnosis === "international_card_blocked"
  ) {
    return {
      recommendedAction: "PAYMENT_LINK",
      reason: "Payment method issue — send a fresh recovery payment link",
      expectedRecoveryProbability: 0.75,
      source: "rules",
    };
  }

  if (input.diagnosis === "temporary_payment_failure" && input.previousAttempts < 2) {
    return {
      recommendedAction: "RETRY_PAYMENT",
      reason: "Likely temporary failure with prior payment history",
      expectedRecoveryProbability: input.successfulPayments > 0 ? 0.78 : 0.55,
      source: "rules",
    };
  }

  if (input.amount <= 15000) {
    return {
      recommendedAction: "PAYMENT_LINK",
      reason: "Send recovery payment link",
      expectedRecoveryProbability: 0.62,
      source: "rules",
    };
  }

  return {
    recommendedAction: "HUMAN_ESCALATION",
    reason: "High amount or exhausted automatic options",
    expectedRecoveryProbability: 0.35,
    source: "rules",
  };
}

export const RECOVERY_ACTIONS = [
  "RETRY_PAYMENT",
  "PAYMENT_LINK",
  "METHOD_UPDATE",
  "WAIT",
  "HUMAN_ESCALATION",
  "STOP",
] as const satisfies readonly RecoveryActionType[];
