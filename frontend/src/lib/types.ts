export type Summary = {
  revenueAtRisk: number;
  recovered: number;
  recoveryRate: number;
  totalCases: number;
  escalatedCases?: number;
  rejectedCases?: number;
  recoveredCases?: number;
  actions: { actionType: string; count: number }[];
};

export type Decision = {
  id: string;
  agent: string;
  diagnosis: string | null;
  confidence: number | null;
  recommendedAction: string | null;
  reason: string | null;
  rawJson: { source?: string } | null;
};

export type AuditLog = {
  id: string;
  recoveryCaseId: string | null;
  eventType: string;
  message: string;
  createdAt: string;
};

export type RecoveryCase = {
  id: string;
  amount: number;
  status: string;
  failureReason: string | null;
  diagnosis: string | null;
  recommendedAction: string | null;
  expectedRecoveryProbability: number | null;
  recoveredAmount: number;
  createdAt: string;
  decisions?: Decision[];
  actions: {
    actionType: string;
    status: string;
    policyDecision?: string;
    razorpayRefId: string | null;
    metadata: { shortUrl?: string; message?: string } | null;
  }[];
  audits?: AuditLog[];
};

export type SeriesPoint = {
  date: string;
  failedInr: number;
  recoveredInr: number;
  cumulativeFailedInr: number;
  cumulativeRecoveredInr: number;
};

export type EvalSnapshot = {
  n: number;
  split: string;
  seed?: number;
  baseline?: {
    recoveryRate: number;
    revenueRecovered: number;
    retries: number;
    unnecessaryRetries: number;
  };
  razorrecover?: {
    recoveryRate: number;
    revenueRecovered: number;
    retries: number;
    unnecessaryRetries: number;
  };
  highlights: { label: string; baseline: string; agent: string; delta: string }[];
};

export type ApiHealth = {
  ok: boolean;
  llm?: {
    configured: boolean;
    model: string;
    provider: string;
  };
};

export type StatusFilter = "ALL" | "WAITING_FOR_WEBHOOK" | "RECOVERED" | "ESCALATED" | "REJECTED";

export type DashboardTab = "overview" | "cases" | "audit" | "evaluation";

export type DemoScenario = "recoverable" | "escalate" | "reject" | "full_recovery";
