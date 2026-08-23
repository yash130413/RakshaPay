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
 * Rules-first (fast + deterministic). LLM optional later.
 */
export async function detectRevenueRisk(input: {
  eventType: string;
  amount: number;
  status?: string;
}): Promise<RiskResult> {
  return detectRevenueRiskRules(input);
}

export { diagnoseFailure, chooseRecoveryStrategy };

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
