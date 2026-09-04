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
  createdAt?: string;
};

export type AuditLog = {
  id: string;
  recoveryCaseId: string | null;
  eventType: string;
  message: string;
  createdAt: string;
  metadata?: {
    customerHistory?: {
      successfulPayments?: number;
      isLoyalCustomer?: boolean;
    } | null;
  } | null;
};

export type CaseCustomer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  successfulPayments?: number;
  avgAmount?: number;
};

export type CasePayment = {
  id: string;
  razorpayPaymentId: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  failureReason: string | null;
};

export type CaseAction = {
  actionType: string;
  status: string;
  policyDecision?: string;
  razorpayRefId: string | null;
  createdAt?: string;
  metadata: {
    shortUrl?: string;
    message?: string;
    paymentLinkId?: string;
    executionMode?: string;
  } | null;
};

export type CaseResult = {
  success: boolean;
  recoveredAmount: number;
  verifiedAt?: string;
  notes?: string | null;
};

export type RecoveryCase = {
  id: string;
  merchantId?: string;
  customerId?: string | null;
  paymentId?: string | null;
  amount: number;
  currency?: string;
  status: string;
  failureReason: string | null;
  diagnosis: string | null;
  diagnosisConfidence?: number | null;
  recommendedAction: string | null;
  expectedRecoveryProbability: number | null;
  recoveredAmount: number;
  attemptCount?: number;
  assignedTo?: string | null;
  assignedToRole?: string | null;
  assignedAt?: string | null;
  assignmentMode?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt?: string;
  customer?: CaseCustomer | null;
  payment?: CasePayment | null;
  decisions?: Decision[];
  actions: CaseAction[];
  results?: CaseResult[];
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

/** Live merchant policy from GET/PUT /api/policy */
export type MerchantPolicy = {
  id: string;
  merchantId: string;
  name: string;
  maxRetries: number;
  maxRecoveryAmount: number;
  allowPaymentLink: boolean;
  requireHumanAbove: number;
  active: boolean;
  updatedAt: string;
};

export type StatusFilter = "ALL" | "WAITING_FOR_WEBHOOK" | "RECOVERED" | "ESCALATED" | "REJECTED";

export type DashboardTab = "overview" | "cases" | "review" | "audit" | "evaluation" | "settings";

export type DemoScenario =
  | "recoverable"
  | "escalate"
  | "reject"
  | "full_recovery"
  | "abandoned";
