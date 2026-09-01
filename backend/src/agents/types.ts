import type { RecoveryActionType } from "@prisma/client";

export type AgentSource = "gemini" | "rules";

export type RiskResult = {
  isRevenueAtRisk: boolean;
  reason: string;
  confidence: number;
  source: AgentSource;
  model?: string;
};

export type DiagnosisResult = {
  diagnosis: string;
  confidence: number;
  failureCategory: string;
  reason?: string;
  source: AgentSource;
  model?: string;
};

export type StrategyResult = {
  recommendedAction: RecoveryActionType;
  reason: string;
  expectedRecoveryProbability: number;
  source: AgentSource;
  model?: string;
};

export type VerifyResult = {
  success: boolean;
  recoveredAmount: number;
  notes: string;
  checks?: {
    eventValid: boolean;
    amountMatch: boolean;
    caseLinked: boolean;
  };
};
