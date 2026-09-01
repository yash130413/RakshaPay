import type { RecoveryActionType } from "@prisma/client";
import type { DiagnosisResult, RiskResult, StrategyResult } from "./types.js";

export function detectRevenueRiskRules(input: {
  eventType: string;
  amount: number;
  status?: string;
}): RiskResult {
  if (input.amount <= 0) {
    return {
      isRevenueAtRisk: false,
      reason: "Zero amount — no revenue at risk",
      confidence: 0.99,
      source: "rules",
    };
  }

  if (input.eventType === "payment.failed") {
    return {
      isRevenueAtRisk: true,
      reason: `Payment failed for ₹${input.amount / 100} — revenue at risk`,
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
  successfulPayments?: number;
}): DiagnosisResult {
  const reason = (input.failureReason ?? "").toLowerCase();
  const loyal = (input.successfulPayments ?? 0) >= 3;

  if (
    reason.includes("abandon") ||
    reason.includes("checkout") ||
    reason.includes("dropped")
  ) {
    return {
      diagnosis: "checkout_abandoned",
      confidence: 0.86,
      failureCategory: "checkout_abandoned",
      reason: "Customer left checkout before completing payment",
      source: "rules",
    };
  }

  if (reason.includes("insufficient")) {
    return {
      diagnosis: "temporary_payment_failure",
      confidence: loyal ? 0.92 : 0.88,
      failureCategory: "insufficient_funds",
      reason: loyal
        ? "Temporary failure — customer has reliable payment history"
        : "Likely temporary insufficient funds",
      source: "rules",
    };
  }

  if (reason.includes("expired")) {
    return {
      diagnosis: "expired_payment_method",
      confidence: 0.92,
      failureCategory: "expired_card",
      reason: "Payment method expired — customer should update card",
      source: "rules",
    };
  }

  if (reason.includes("international")) {
    return {
      diagnosis: "international_card_blocked",
      confidence: 0.9,
      failureCategory: "international_transaction_not_allowed",
      reason: "International card blocked for this merchant",
      source: "rules",
    };
  }

  return {
    diagnosis: "generic_payment_failure",
    confidence: 0.7,
    failureCategory: reason || "unknown",
    reason: loyal
      ? "Generic failure but customer history is strong"
      : "Unable to classify failure precisely",
    source: "rules",
  };
}

export function chooseRecoveryStrategyRules(input: {
  diagnosis: string;
  amount: number;
  previousAttempts: number;
  successfulPayments: number;
}): StrategyResult {
  const loyal = input.successfulPayments >= 3;

  if (input.diagnosis === "checkout_abandoned") {
    return {
      recommendedAction: "PAYMENT_LINK",
      reason: "Checkout abandoned — send a recovery payment link to complete purchase",
      expectedRecoveryProbability: 0.68,
      source: "rules",
    };
  }

  if (
    input.diagnosis === "expired_payment_method" ||
    input.diagnosis === "international_card_blocked"
  ) {
    return {
      recommendedAction: "METHOD_UPDATE",
      reason: "Payment method issue — ask customer to update method via recovery link",
      expectedRecoveryProbability: 0.75,
      source: "rules",
    };
  }

  if (input.diagnosis === "temporary_payment_failure" && input.previousAttempts < 2) {
    const prob = loyal ? 0.82 : input.successfulPayments > 0 ? 0.72 : 0.55;
    return {
      recommendedAction: "RETRY_PAYMENT",
      reason: loyal
        ? `Retry recommended — customer has ${input.successfulPayments} successful payments`
        : "Likely temporary failure — retry via recovery payment link",
      expectedRecoveryProbability: prob,
      source: "rules",
    };
  }

  if (input.amount <= 15000) {
    return {
      recommendedAction: "PAYMENT_LINK",
      reason: "Send recovery payment link",
      expectedRecoveryProbability: loyal ? 0.7 : 0.62,
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
