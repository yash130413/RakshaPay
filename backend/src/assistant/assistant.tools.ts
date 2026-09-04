import { prisma } from "../db.js";
import { EVAL_SNAPSHOT } from "../analytics/eval.snapshot.js";
import { evaluatePolicy } from "../policy/policy.engine.js";
import type { RecoveryActionType } from "@prisma/client";

const caseInclude = {
  decisions: { orderBy: { createdAt: "asc" as const } },
  actions: { orderBy: { createdAt: "asc" as const } },
  results: true,
  customer: true,
  payment: true,
  audits: { orderBy: { createdAt: "desc" as const }, take: 12 },
};

function formatCaseBrief(c: {
  id: string;
  status: string;
  amount: number;
  diagnosis: string | null;
  recommendedAction: string | null;
  failureReason: string | null;
  recoveredAmount: number;
  createdAt: Date;
  decisions?: { agent: string; diagnosis: string | null; recommendedAction: string | null; reason: string | null; rawJson: unknown }[];
  customer?: { name: string | null; email: string | null; phone: string | null } | null;
}) {
  const sources = (c.decisions ?? []).map((d) => {
    const raw = d.rawJson as { source?: string } | null;
    return raw?.source ?? d.agent;
  });
  const aiSource = sources.some((s) => String(s).includes("gemini"))
    ? "gemini"
    : sources.some((s) => String(s).includes("rules"))
      ? "rules"
      : "pending";

  return {
    id: c.id,
    status: c.status,
    amountInr: c.amount / 100,
    recoveredInr: c.recoveredAmount / 100,
    diagnosis: c.diagnosis,
    recommendedAction: c.recommendedAction,
    failureReason: c.failureReason,
    aiSource,
    customer: c.customer
      ? {
          name: c.customer.name,
          email: c.customer.email,
          phone: c.customer.phone,
        }
      : null,
    createdAt: c.createdAt.toISOString(),
    decisions: (c.decisions ?? []).map((d) => ({
      agent: d.agent,
      diagnosis: d.diagnosis,
      recommendedAction: d.recommendedAction,
      reason: d.reason,
      source: (d.rawJson as { source?: string } | null)?.source ?? null,
    })),
  };
}

export async function getDashboardSummary() {
  const [atRiskAgg, recoveredAgg, total, escalated, rejected, recovered, waiting, byStatus] =
    await Promise.all([
      prisma.recoveryCase.aggregate({
        _sum: { amount: true },
        where: { status: { notIn: ["RECOVERED", "REJECTED"] } },
      }),
      prisma.recoveryCase.aggregate({
        _sum: { recoveredAmount: true },
        where: { status: "RECOVERED" },
      }),
      prisma.recoveryCase.count(),
      prisma.recoveryCase.count({ where: { status: "ESCALATED" } }),
      prisma.recoveryCase.count({ where: { status: "REJECTED" } }),
      prisma.recoveryCase.count({ where: { status: "RECOVERED" } }),
      prisma.recoveryCase.count({ where: { status: "WAITING_FOR_WEBHOOK" } }),
      prisma.recoveryCase.groupBy({ by: ["status"], _count: true }),
    ]);

  const atRisk = (atRiskAgg._sum.amount ?? 0) / 100;
  const recoveredInr = (recoveredAgg._sum.recoveredAmount ?? 0) / 100;
  const recoveryRate =
    atRisk + recoveredInr > 0 ? recoveredInr / (atRisk + recoveredInr) : 0;

  return {
    totalCases: total,
    recoveredCases: recovered,
    escalatedCases: escalated,
    rejectedCases: rejected,
    awaitingPaymentCases: waiting,
    revenueAtRiskInr: Math.round(atRisk),
    recoveredInr: Math.round(recoveredInr),
    recoveryRatePct: Math.round(recoveryRate * 1000) / 10,
    statusBreakdown: byStatus.map((s) => ({
      status: s.status,
      count: s._count,
    })),
  };
}

export async function listCases(params: {
  status?: string;
  limit?: number;
  search?: string;
}) {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 25);
  const status = params.status?.trim().toUpperCase();
  const search = params.search?.trim().toLowerCase();

  const cases = await prisma.recoveryCase.findMany({
    where: {
      ...(status && status !== "ALL" ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: search ? 50 : limit,
    include: caseInclude,
  });

  let filtered = cases;
  if (search) {
    filtered = cases.filter((c) => {
      const blob = [
        c.id,
        c.diagnosis,
        c.failureReason,
        c.recommendedAction,
        c.status,
        c.customer?.email,
        c.customer?.name,
        c.customer?.phone,
        String(c.amount / 100),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(search);
    });
  }

  return filtered.slice(0, limit).map(formatCaseBrief);
}

export async function getCaseDetail(caseId: string) {
  const id = caseId.trim();
  const c = await prisma.recoveryCase.findFirst({
    where: {
      OR: [{ id }, { id: { startsWith: id } }],
    },
    include: caseInclude,
  });
  if (!c) return { error: `Case not found: ${caseId}` };

  const brief = formatCaseBrief(c);
  return {
    ...brief,
    actions: c.actions.map((a) => ({
      actionType: a.actionType,
      status: a.status,
      policyDecision: a.policyDecision,
      razorpayRefId: a.razorpayRefId,
      shortUrl: (a.metadata as { shortUrl?: string } | null)?.shortUrl ?? null,
      message: (a.metadata as { message?: string } | null)?.message ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    recentAudit: c.audits.map((a) => ({
      eventType: a.eventType,
      message: a.message,
      createdAt: a.createdAt.toISOString(),
    })),
    payment: c.payment
      ? {
          razorpayPaymentId: c.payment.razorpayPaymentId,
          status: c.payment.status,
          method: c.payment.method,
          failureReason: c.payment.failureReason,
        }
      : null,
  };
}

export async function getPolicy() {
  const email = (process.env.MERCHANT_EMAIL ?? "demo@rakshapay.com").trim().toLowerCase();
  const merchant = await prisma.merchant.findUnique({
    where: { email },
    include: { policies: { where: { active: true }, orderBy: { updatedAt: "desc" }, take: 1 } },
  });
  const p = merchant?.policies[0];
  if (!p) {
    return {
      maxRetries: 2,
      maxRecoveryAmount: 50000,
      requireHumanAbove: 25000,
      allowPaymentLink: true,
      notifyCustomerSms: true,
      notifyCustomerEmail: true,
    };
  }
  return {
    maxRetries: p.maxRetries,
    maxRecoveryAmount: p.maxRecoveryAmount,
    requireHumanAbove: p.requireHumanAbove,
    allowPaymentLink: p.allowPaymentLink,
    notifyCustomerSms: p.notifyCustomerSms,
    notifyCustomerEmail: p.notifyCustomerEmail,
  };
}

export async function getAuditEvents(params: { caseId?: string; limit?: number }) {
  const limit = Math.min(Math.max(params.limit ?? 15, 1), 40);
  const logs = await prisma.auditLog.findMany({
    where: params.caseId ? { recoveryCaseId: params.caseId } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return logs.map((a) => ({
    id: a.id,
    recoveryCaseId: a.recoveryCaseId,
    eventType: a.eventType,
    message: a.message,
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function simulatePolicy(amountInr: number) {
  const policy = await getPolicy();
  const amount = Number(amountInr);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "amountInr must be a positive number" };
  }

  const actions: RecoveryActionType[] = [
    "PAYMENT_LINK",
    "RETRY_PAYMENT",
    "METHOD_UPDATE",
  ];

  const results = actions.map((action) => {
    const r = evaluatePolicy({
      action,
      amount,
      attemptCount: 0,
      policy,
    });
    return { action, decision: r.decision, reasons: r.reasons };
  });

  let outcome = "AUTO RECOVER";
  if (amount > policy.maxRecoveryAmount) outcome = "REJECTED";
  else if (amount > policy.requireHumanAbove) outcome = "ESCALATE → Human review";

  return {
    amountInr: amount,
    outcome,
    policy,
    actionChecks: results,
  };
}

export function getResearchMetrics() {
  return {
    split: EVAL_SNAPSHOT.split,
    n: EVAL_SNAPSHOT.n,
    seed: EVAL_SNAPSHOT.seed,
    highlights: EVAL_SNAPSHOT.highlights,
    baseline: EVAL_SNAPSHOT.baseline,
    agent: EVAL_SNAPSHOT.razorrecover,
  };
}

export const ASSISTANT_TOOL_DECLARATIONS = [
  {
    name: "get_dashboard_summary",
    description:
      "Get live KPIs: total cases, recovered/escalated/rejected counts, revenue at risk, recovery rate.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "list_cases",
    description:
      "List recent recovery cases. Optional status filter (RECOVERED, ESCALATED, REJECTED, WAITING_FOR_WEBHOOK, FAILED, etc), search text, and limit.",
    parameters: {
      type: "OBJECT",
      properties: {
        status: { type: "STRING", description: "Case status or ALL" },
        search: { type: "STRING", description: "Search diagnosis, customer, amount, id" },
        limit: { type: "NUMBER", description: "Max cases (default 10)" },
      },
    },
  },
  {
    name: "get_case_detail",
    description:
      "Get full detail for one recovery case including AI diagnosis, strategy, actions, payment link, and recent audit.",
    parameters: {
      type: "OBJECT",
      properties: {
        caseId: { type: "STRING", description: "Full or short case id" },
      },
      required: ["caseId"],
    },
  },
  {
    name: "get_policy",
    description: "Get current merchant policy guardrails (escalation threshold, rejection limit, retries, notify flags).",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "get_audit_events",
    description: "Get recent audit trail events, optionally filtered by caseId.",
    parameters: {
      type: "OBJECT",
      properties: {
        caseId: { type: "STRING" },
        limit: { type: "NUMBER" },
      },
    },
  },
  {
    name: "simulate_policy",
    description:
      "Simulate how merchant policy would treat a failed payment of a given INR amount (AUTO / ESCALATE / REJECT).",
    parameters: {
      type: "OBJECT",
      properties: {
        amountInr: { type: "NUMBER", description: "Amount in INR rupees" },
      },
      required: ["amountInr"],
    },
  },
  {
    name: "get_research_metrics",
    description: "Get holdout evaluation research metrics (baseline vs RakshaPay recovery rate, etc).",
    parameters: { type: "OBJECT", properties: {} },
  },
] as const;

export async function executeAssistantTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_dashboard_summary":
      return getDashboardSummary();
    case "list_cases":
      return listCases({
        status: typeof args.status === "string" ? args.status : undefined,
        search: typeof args.search === "string" ? args.search : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
    case "get_case_detail":
      return getCaseDetail(String(args.caseId ?? ""));
    case "get_policy":
      return getPolicy();
    case "get_audit_events":
      return getAuditEvents({
        caseId: typeof args.caseId === "string" ? args.caseId : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
    case "simulate_policy":
      return simulatePolicy(Number(args.amountInr));
    case "get_research_metrics":
      return getResearchMetrics();
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
