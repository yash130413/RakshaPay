import type { RecoveryActionType } from "@prisma/client";

export type RiskResult = {
  isRevenueAtRisk: boolean;
  reason: string;
  confidence: number;
};

/**
 * Agent 1 — Is this actually revenue at risk?
 * Day 1: rule-based. Day 3: LLM-backed structured JSON.
 */
export async function detectRevenueRisk(input: {
  eventType: string;
  amount: number;
  status?: string;
}): Promise<RiskResult> {
  if (input.eventType === "payment.failed") {
    return {
      isRevenueAtRisk: true,
      reason: "Payment failed — revenue at risk",
      confidence: 0.95,
    };
  }

  if (input.eventType === "payment.captured") {
    return {
      isRevenueAtRisk: false,
      reason: "Payment already captured",
      confidence: 0.99,
    };
  }

  return {
    isRevenueAtRisk: input.amount > 0,
    reason: "Unknown event — treat as potential risk",
    confidence: 0.4,
  };
}

export type DiagnosisResult = {
  diagnosis: string;
  confidence: number;
  failureCategory: string;
};

export async function diagnoseFailure(input: {
  failureReason?: string | null;
  method?: string | null;
  previousAttempts?: number;
}): Promise<DiagnosisResult> {
  const reason = (input.failureReason ?? "").toLowerCase();

  if (reason.includes("insufficient")) {
    return {
      diagnosis: "temporary_payment_failure",
      confidence: 0.88,
      failureCategory: "insufficient_funds",
    };
  }

  if (reason.includes("expired")) {
    return {
      diagnosis: "expired_payment_method",
      confidence: 0.92,
      failureCategory: "expired_card",
    };
  }

  return {
    diagnosis: "generic_payment_failure",
    confidence: 0.7,
    failureCategory: reason || "unknown",
  };
}

export type StrategyResult = {
  recommendedAction: RecoveryActionType;
  reason: string;
  expectedRecoveryProbability: number;
};

export async function chooseRecoveryStrategy(input: {
  diagnosis: string;
  amount: number;
  previousAttempts: number;
  successfulPayments: number;
}): Promise<StrategyResult> {
  if (input.diagnosis === "expired_payment_method") {
    return {
      recommendedAction: "METHOD_UPDATE",
      reason: "Card expired — request payment method update",
      expectedRecoveryProbability: 0.81,
    };
  }

  if (input.diagnosis === "temporary_payment_failure" && input.previousAttempts < 2) {
    return {
      recommendedAction: "RETRY_PAYMENT",
      reason: "Likely temporary failure with prior payment history",
      expectedRecoveryProbability: input.successfulPayments > 0 ? 0.78 : 0.55,
    };
  }

  if (input.amount <= 15000) {
    return {
      recommendedAction: "PAYMENT_LINK",
      reason: "Send recovery payment link",
      expectedRecoveryProbability: 0.62,
    };
  }

  return {
    recommendedAction: "HUMAN_ESCALATION",
    reason: "High amount or exhausted automatic options",
    expectedRecoveryProbability: 0.35,
  };
}

export type VerifyResult = {
  success: boolean;
  recoveredAmount: number;
  notes: string;
};

export async function verifyRecovery(input: {
  eventType: string;
  amount: number;
}): Promise<VerifyResult> {
  if (input.eventType === "payment.captured") {
    return {
      success: true,
      recoveredAmount: input.amount,
      notes: "Payment captured via webhook",
    };
  }

  return {
    success: false,
    recoveredAmount: 0,
    notes: "No capture event — recovery not confirmed",
  };
}
