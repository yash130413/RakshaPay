import { prisma } from "../db.js";
import { EVAL_SNAPSHOT } from "../analytics/eval.snapshot.js";
import { evaluatePolicy } from "../policy/policy.engine.js";
import { writeAudit } from "../audit/audit.service.js";
import { LOYAL_DEMO_EMAIL } from "../customers/customer.context.js";
import { executeRecoveryAction } from "../recovery/recovery.executor.js";
import { startRecoveryWorkflow } from "../workflows/recovery.workflow.js";
import type { RecoveryActionType } from "@prisma/client";

export const WRITE_TOOLS = new Set([
  "assign_case",
  "assign_all_unassigned_escalated",
  "review_case",
  "run_demo",
  "update_policy",
]);

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
  assignedTo?: string | null;
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
    assignedTo: c.assignedTo ?? null,
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

function isConfirmed(args: Record<string, unknown>) {
  return args.confirmed === true || args.confirmed === "true";
}

function needsConfirm(
  tool: string,
  args: Record<string, unknown>,
  summary: string,
  preview?: unknown
) {
  if (isConfirmed(args)) return null;
  const { confirmed: _c, ...rest } = args;
  return {
    needsConfirmation: true,
    tool,
    args: rest,
    summary,
    preview: preview ?? null,
  };
}

async function resolveCase(caseIdRaw: string) {
  const id = String(caseIdRaw ?? "").trim();
  if (!id) return null;
  return prisma.recoveryCase.findFirst({
    where: { OR: [{ id }, { id: { startsWith: id } }] },
    include: { customer: true, payment: true, decisions: true },
  });
}

export async function listUnassignedEscalated() {
  const cases = await prisma.recoveryCase.findMany({
    where: {
      status: "ESCALATED",
      OR: [{ assignedTo: null }, { assignedTo: "" }],
    },
    orderBy: { updatedAt: "desc" },
    take: 25,
    include: caseInclude,
  });
  return {
    count: cases.length,
    cases: cases.map((c) => ({
      ...formatCaseBrief(c),
      assignedTo: c.assignedTo,
    })),
  };
}

export async function assignCase(args: Record<string, unknown>) {
  const caseId = String(args.caseId ?? "");
  const assignedTo =
    String(args.assignedTo ?? "").trim() ||
    process.env.MERCHANT_NAME ||
    "Demo Merchant";
  const assignedToRole = String(args.assignedToRole ?? "Merchant").trim() || "Merchant";
  const mode = String(args.mode ?? "SELF").toUpperCase() === "MANUAL" ? "MANUAL" : "SELF";

  const recoveryCase = await resolveCase(caseId);
  if (!recoveryCase) return { error: `Case not found: ${caseId}` };
  if (recoveryCase.status !== "ESCALATED") {
    return { error: `Case ${recoveryCase.id.slice(-8)} is ${recoveryCase.status}, not ESCALATED` };
  }

  const summary = `Assign case …${recoveryCase.id.slice(-8)} (₹${recoveryCase.amount / 100}) to ${assignedTo} (${assignedToRole})`;
  const pending = needsConfirm("assign_case", { ...args, caseId: recoveryCase.id, assignedTo, assignedToRole, mode }, summary, {
    caseId: recoveryCase.id,
    amountInr: recoveryCase.amount / 100,
    diagnosis: recoveryCase.diagnosis,
  });
  if (pending) return pending;

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      assignedTo,
      assignedToRole,
      assignedAt: new Date(),
      assignmentMode: mode,
    },
  });
  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "review.assigned",
    message: `RakshaPay agent assigned review to ${assignedTo}`,
    metadata: { mode, assignedTo, assignedToRole, source: "assistant" },
  });

  return {
    ok: true,
    caseId: recoveryCase.id,
    assignedTo,
    assignedToRole,
    message: summary,
  };
}

export async function assignAllUnassignedEscalated(args: Record<string, unknown>) {
  const assignedTo =
    String(args.assignedTo ?? "").trim() ||
    process.env.MERCHANT_NAME ||
    "Demo Merchant";
  const assignedToRole = String(args.assignedToRole ?? "Merchant").trim() || "Merchant";

  const queue = await prisma.recoveryCase.findMany({
    where: {
      status: "ESCALATED",
      OR: [{ assignedTo: null }, { assignedTo: "" }],
    },
    orderBy: { updatedAt: "desc" },
    take: 25,
  });

  if (!queue.length) {
    return { ok: true, assigned: 0, message: "No unassigned escalated cases" };
  }

  const summary = `Assign ${queue.length} escalated case(s) to ${assignedTo} for Review-page approval`;
  const pending = needsConfirm(
    "assign_all_unassigned_escalated",
    { ...args, assignedTo, assignedToRole },
    summary,
    {
      count: queue.length,
      caseIds: queue.map((c) => c.id),
      amountsInr: queue.map((c) => c.amount / 100),
    }
  );
  if (pending) return pending;

  const assigned = [];
  for (const c of queue) {
    await prisma.recoveryCase.update({
      where: { id: c.id },
      data: {
        assignedTo,
        assignedToRole,
        assignedAt: new Date(),
        assignmentMode: "SELF",
      },
    });
    await writeAudit({
      recoveryCaseId: c.id,
      eventType: "review.assigned",
      message: `RakshaPay agent bulk-assigned review to ${assignedTo}`,
      metadata: { assignedTo, assignedToRole, source: "assistant" },
    });
    assigned.push(c.id);
  }

  return { ok: true, assigned: assigned.length, caseIds: assigned, message: summary };
}

export async function reviewCase(args: Record<string, unknown>) {
  const action = String(args.action ?? "").toLowerCase();
  const notes = String(args.notes ?? "").trim();
  const reviewedBy =
    String(args.reviewedBy ?? "").trim() ||
    process.env.MERCHANT_NAME ||
    "Demo Merchant";

  if (!["approve", "reject", "request_info"].includes(action)) {
    return { error: "action must be approve, reject, or request_info" };
  }

  const recoveryCase = await resolveCase(String(args.caseId ?? ""));
  if (!recoveryCase) return { error: `Case not found: ${args.caseId}` };
  if (recoveryCase.status !== "ESCALATED") {
    return { error: `Case is ${recoveryCase.status}, not ESCALATED` };
  }
  if (!recoveryCase.assignedTo) {
    return {
      error: "Case is not assigned yet. Call assign_case first so Review page can show it for the assignee.",
    };
  }

  const summary = `${action.toUpperCase()} case …${recoveryCase.id.slice(-8)} (₹${recoveryCase.amount / 100})${notes ? ` — ${notes}` : ""}`;
  const pending = needsConfirm(
    "review_case",
    { ...args, caseId: recoveryCase.id, action, notes, reviewedBy },
    summary,
    { caseId: recoveryCase.id, action, assignedTo: recoveryCase.assignedTo }
  );
  if (pending) return pending;

  if (action === "request_info") {
    if (!notes) return { error: "notes required for request_info" };
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { reviewNotes: notes },
    });
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: "review.info_requested",
      message: `${reviewedBy} requested more info: ${notes}`,
      metadata: { reviewedBy, notes, source: "assistant" },
    });
    return { ok: true, action, caseId: recoveryCase.id, message: summary };
  }

  if (action === "reject") {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "REJECTED", reviewNotes: notes || recoveryCase.reviewNotes },
    });
    await prisma.recoveryAction.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        actionType: "STOP",
        policyDecision: "REJECTED",
        status: "human_rejected",
        metadata: { reviewedBy, notes, source: "assistant" },
      },
    });
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: "review.rejected",
      message: `${reviewedBy} rejected recovery${notes ? `: ${notes}` : ""}`,
      metadata: { reviewedBy, notes, source: "assistant" },
    });
    return { ok: true, action, caseId: recoveryCase.id, message: summary };
  }

  const execAction =
    recoveryCase.recommendedAction &&
    recoveryCase.recommendedAction !== "STOP" &&
    recoveryCase.recommendedAction !== "HUMAN_ESCALATION"
      ? recoveryCase.recommendedAction
      : "PAYMENT_LINK";

  const execution = await executeRecoveryAction({
    recoveryCaseId: recoveryCase.id,
    action: execAction,
    amountPaise: recoveryCase.amount,
    currency: recoveryCase.currency,
    customer: {
      name: recoveryCase.customer?.name ?? undefined,
      email: recoveryCase.customer?.email ?? undefined,
      contact: recoveryCase.customer?.phone ?? undefined,
    },
  });

  await prisma.recoveryAction.create({
    data: {
      recoveryCaseId: recoveryCase.id,
      actionType: execAction,
      policyDecision: "APPROVED",
      status: execution.status,
      razorpayRefId: execution.razorpayRefId,
      metadata: {
        message: execution.message,
        shortUrl: execution.shortUrl,
        humanOverride: true,
        reviewedBy,
        notes,
        source: "assistant",
        ...(execution.metadata ?? {}),
      },
    },
  });

  if (execution.ok) {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: {
        status: "WAITING_FOR_WEBHOOK",
        attemptCount: { increment: 1 },
        reviewNotes: notes || recoveryCase.reviewNotes,
      },
    });
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: "review.approved",
      message: `${reviewedBy} approved via RakshaPay agent (${execAction})`,
      metadata: {
        reviewedBy,
        notes,
        execAction,
        razorpayRefId: execution.razorpayRefId,
        shortUrl: execution.shortUrl,
        source: "assistant",
      },
    });
  } else {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "FAILED", attemptCount: { increment: 1 } },
    });
  }

  return {
    ok: execution.ok,
    action,
    caseId: recoveryCase.id,
    execAction,
    shortUrl: execution.shortUrl ?? null,
    message: summary,
  };
}

export async function runDemo(args: Record<string, unknown>) {
  const scenario = String(args.scenario ?? "escalate").trim() || "escalate";
  const presets: Record<string, { amountInr: number; failureReason: string; label: string; email?: string }> = {
    recoverable: {
      amountInr: 2499,
      failureReason: "insufficient funds",
      label: "Standard recovery path",
      email: LOYAL_DEMO_EMAIL,
    },
    escalate: {
      amountInr: 30000,
      failureReason: "card expired",
      label: "Human escalation",
    },
    reject: {
      amountInr: 60000,
      failureReason: "bank decline",
      label: "Policy reject",
    },
    full_recovery: {
      amountInr: 3499,
      failureReason: "insufficient funds",
      label: "Full recovery loop",
      email: LOYAL_DEMO_EMAIL,
    },
    abandoned: {
      amountInr: 999,
      failureReason: "checkout abandoned by customer",
      label: "Checkout abandoned",
    },
  };
  const preset = presets[scenario] ?? presets.escalate;
  const summary = `Run demo scenario "${scenario}" (₹${preset.amountInr}) — ${preset.label}`;
  const pending = needsConfirm("run_demo", { ...args, scenario }, summary, { scenario, ...preset });
  if (pending) return pending;

  const suffix = `${Date.now()}`;
  const amountPaise = preset.amountInr * 100;
  const paymentId = `pay_demo_${scenario}_${suffix}`;
  const failPayload = {
    event: "payment.failed",
    id: `evt_demo_${scenario}_${suffix}`,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          amount: amountPaise,
          currency: "INR",
          status: "failed",
          method: "card",
          error_reason: preset.failureReason,
          ...(preset.email ? { email: preset.email, contact: "+919876543210" } : {}),
        },
      },
    },
  };

  const stored = await prisma.webhookEvent.create({
    data: {
      eventId: failPayload.id,
      eventType: failPayload.event,
      payload: failPayload as object,
    },
  });

  await writeAudit({
    eventType: "demo.triggered",
    message: `RakshaPay agent demo "${scenario}": ${preset.label}`,
    metadata: { scenario, amountInr: preset.amountInr, source: "assistant" },
  });

  await startRecoveryWorkflow({ webhookEventId: stored.id, payload: failPayload });
  await prisma.webhookEvent.update({
    where: { id: stored.id },
    data: { processed: true, processedAt: new Date() },
  });

  const recoveryCase = await prisma.recoveryCase.findFirst({
    where: { payment: { razorpayPaymentId: paymentId } },
    orderBy: { createdAt: "desc" },
    include: caseInclude,
  });

  return {
    ok: true,
    scenario,
    case: recoveryCase ? formatCaseBrief(recoveryCase) : null,
    message: summary,
  };
}

export async function updatePolicy(args: Record<string, unknown>) {
  const email = (process.env.MERCHANT_EMAIL ?? "demo@rakshapay.com").trim().toLowerCase();
  const merchant = await prisma.merchant.findUnique({
    where: { email },
    include: { policies: { where: { active: true }, orderBy: { updatedAt: "desc" }, take: 1 } },
  });
  if (!merchant) return { error: "Merchant not found" };
  let policy = merchant.policies[0];
  if (!policy) {
    policy = await prisma.policy.create({
      data: {
        merchantId: merchant.id,
        name: "default",
        maxRetries: 2,
        maxRecoveryAmount: 50000,
        requireHumanAbove: 25000,
        allowPaymentLink: true,
        notifyCustomerSms: true,
        notifyCustomerEmail: true,
      },
    });
  }

  const next = {
    maxRetries:
      args.maxRetries != null ? Number(args.maxRetries) : policy.maxRetries,
    maxRecoveryAmount:
      args.maxRecoveryAmount != null
        ? Number(args.maxRecoveryAmount)
        : policy.maxRecoveryAmount,
    requireHumanAbove:
      args.requireHumanAbove != null
        ? Number(args.requireHumanAbove)
        : policy.requireHumanAbove,
    allowPaymentLink:
      args.allowPaymentLink != null
        ? Boolean(args.allowPaymentLink)
        : policy.allowPaymentLink,
    notifyCustomerSms:
      args.notifyCustomerSms != null
        ? Boolean(args.notifyCustomerSms)
        : policy.notifyCustomerSms,
    notifyCustomerEmail:
      args.notifyCustomerEmail != null
        ? Boolean(args.notifyCustomerEmail)
        : policy.notifyCustomerEmail,
  };

  if (!Number.isInteger(next.maxRetries) || next.maxRetries < 0 || next.maxRetries > 10) {
    return { error: "maxRetries must be 0–10" };
  }
  if (!Number.isInteger(next.maxRecoveryAmount) || next.maxRecoveryAmount < 1000) {
    return { error: "maxRecoveryAmount must be ≥ 1000" };
  }
  if (next.requireHumanAbove >= next.maxRecoveryAmount) {
    return { error: "requireHumanAbove must be lower than maxRecoveryAmount" };
  }

  const summary = `Update policy → human>₹${next.requireHumanAbove.toLocaleString("en-IN")}, reject>₹${next.maxRecoveryAmount.toLocaleString("en-IN")}, retries=${next.maxRetries}`;
  const pending = needsConfirm("update_policy", { ...args, ...next }, summary, next);
  if (pending) return pending;

  const updated = await prisma.policy.update({
    where: { id: policy.id },
    data: next,
  });

  return {
    ok: true,
    policy: {
      maxRetries: updated.maxRetries,
      maxRecoveryAmount: updated.maxRecoveryAmount,
      requireHumanAbove: updated.requireHumanAbove,
      allowPaymentLink: updated.allowPaymentLink,
      notifyCustomerSms: updated.notifyCustomerSms,
      notifyCustomerEmail: updated.notifyCustomerEmail,
    },
    message: summary,
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
    name: "list_unassigned_escalated",
    description: "List escalated cases that still need a human reviewer assignment.",
    parameters: { type: "OBJECT", properties: {} },
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
  {
    name: "assign_case",
    description:
      "Assign one ESCALATED case to a human reviewer (default: merchant). Requires confirmed=true after user approval. Then reviewer only needs Approve/Reject on Review page.",
    parameters: {
      type: "OBJECT",
      properties: {
        caseId: { type: "STRING" },
        assignedTo: { type: "STRING" },
        assignedToRole: { type: "STRING" },
        mode: { type: "STRING", description: "SELF or MANUAL" },
        confirmed: { type: "BOOLEAN" },
      },
      required: ["caseId"],
    },
  },
  {
    name: "assign_all_unassigned_escalated",
    description:
      "Bulk-assign all unassigned ESCALATED cases to the merchant/reviewer. Requires confirmed=true.",
    parameters: {
      type: "OBJECT",
      properties: {
        assignedTo: { type: "STRING" },
        assignedToRole: { type: "STRING" },
        confirmed: { type: "BOOLEAN" },
      },
    },
  },
  {
    name: "review_case",
    description:
      "Approve, reject, or request_info on an assigned ESCALATED case. Prefer assign first so Review page can also act. Requires confirmed=true.",
    parameters: {
      type: "OBJECT",
      properties: {
        caseId: { type: "STRING" },
        action: { type: "STRING", description: "approve | reject | request_info" },
        notes: { type: "STRING" },
        reviewedBy: { type: "STRING" },
        confirmed: { type: "BOOLEAN" },
      },
      required: ["caseId", "action"],
    },
  },
  {
    name: "run_demo",
    description:
      "Trigger a demo payment.failed scenario: recoverable | escalate | reject | full_recovery | abandoned. Requires confirmed=true.",
    parameters: {
      type: "OBJECT",
      properties: {
        scenario: { type: "STRING" },
        confirmed: { type: "BOOLEAN" },
      },
    },
  },
  {
    name: "update_policy",
    description:
      "Update merchant policy guardrails. Pass only fields to change. Requires confirmed=true.",
    parameters: {
      type: "OBJECT",
      properties: {
        maxRetries: { type: "NUMBER" },
        maxRecoveryAmount: { type: "NUMBER" },
        requireHumanAbove: { type: "NUMBER" },
        allowPaymentLink: { type: "BOOLEAN" },
        notifyCustomerSms: { type: "BOOLEAN" },
        notifyCustomerEmail: { type: "BOOLEAN" },
        confirmed: { type: "BOOLEAN" },
      },
    },
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
    case "list_unassigned_escalated":
      return listUnassignedEscalated();
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
    case "assign_case":
      return assignCase(args);
    case "assign_all_unassigned_escalated":
      return assignAllUnassignedEscalated(args);
    case "review_case":
      return reviewCase(args);
    case "run_demo":
      return runDemo(args);
    case "update_policy":
      return updatePolicy(args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
