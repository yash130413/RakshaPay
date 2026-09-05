import { prisma } from "../db.js";
import { EVAL_SNAPSHOT } from "../analytics/eval.snapshot.js";
import { evaluatePolicy } from "../policy/policy.engine.js";
import { writeAudit } from "../audit/audit.service.js";
import { LOYAL_DEMO_EMAIL } from "../customers/customer.context.js";
import { executeRecoveryAction } from "../recovery/recovery.executor.js";
import { startRecoveryWorkflow } from "../workflows/recovery.workflow.js";
import {
  createB2BInvoiceCase,
  createMandateRetryCase,
  listDueActions,
  processDueActions,
  setPromiseToPay,
} from "../recovery/sequencer.service.js";
import type { RecoveryActionType } from "@prisma/client";

export const WRITE_TOOLS = new Set([
  "assign_case",
  "assign_all_unassigned_escalated",
  "review_case",
  "run_demo",
  "update_policy",
  "simulate_capture",
  "resend_payment_link",
  "reassign_case",
  "unassign_case",
  "bulk_review",
  "set_promise_to_pay",
  "run_scheduler_tick",
]);

/** Soft UI directives — executed by the dashboard, no DB write confirm needed */
export const UI_TOOLS = new Set(["navigate_ui", "export_audit"]);

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
  caseSource?: string | null;
  promiseToPayAt?: Date | null;
  promiseNote?: string | null;
  nextActionAt?: Date | null;
  retrySequenceIndex?: number | null;
  invoiceNumber?: string | null;
  buyerCompany?: string | null;
  invoiceDueAt?: Date | null;
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
    caseSource: c.caseSource ?? "PAYMENT_FAILED",
    amountInr: c.amount / 100,
    recoveredInr: c.recoveredAmount / 100,
    diagnosis: c.diagnosis,
    recommendedAction: c.recommendedAction,
    failureReason: c.failureReason,
    assignedTo: c.assignedTo ?? null,
    promiseToPayAt: c.promiseToPayAt?.toISOString() ?? null,
    promiseNote: c.promiseNote ?? null,
    nextActionAt: c.nextActionAt?.toISOString() ?? null,
    retrySequenceIndex: c.retrySequenceIndex ?? 0,
    invoiceNumber: c.invoiceNumber ?? null,
    buyerCompany: c.buyerCompany ?? null,
    invoiceDueAt: c.invoiceDueAt?.toISOString() ?? null,
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
      retryScheduleDays: "1,3,7",
      maxRecoveryAmount: 50000,
      requireHumanAbove: 25000,
      maxInvoiceReminders: 3,
      allowPaymentLink: true,
      notifyCustomerSms: true,
      notifyCustomerEmail: true,
    };
  }
  return {
    maxRetries: p.maxRetries,
    retryScheduleDays: p.retryScheduleDays,
    maxRecoveryAmount: p.maxRecoveryAmount,
    requireHumanAbove: p.requireHumanAbove,
    maxInvoiceReminders: p.maxInvoiceReminders,
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

  if (scenario === "mandate_retry" || scenario === "b2b_invoice" || scenario === "promise_to_pay") {
    const summary =
      scenario === "mandate_retry"
        ? "Run demo: mandate retry sequencer (day 1→3→7)"
        : scenario === "b2b_invoice"
          ? "Run demo: B2B overdue invoice receivable"
          : "Run demo: promise-to-pay tracker";
    const pending = needsConfirm("run_demo", { ...args, scenario }, summary, { scenario });
    if (pending) return pending;

    // Delegate to sequencer helpers
    const email = (process.env.MERCHANT_EMAIL ?? "demo@rakshapay.com").trim().toLowerCase();
    const merchant = await prisma.merchant.upsert({
      where: { email },
      update: {},
      create: {
        name: process.env.MERCHANT_NAME || "Demo Merchant",
        email,
        policies: {
          create: {
            name: "default",
            maxRetries: 3,
            retryScheduleDays: "1,3,7",
            maxRecoveryAmount: 50000,
            requireHumanAbove: 25000,
            allowPaymentLink: true,
            maxInvoiceReminders: 3,
            notifyCustomerSms: true,
            notifyCustomerEmail: true,
          },
        },
      },
    });

    if (scenario === "mandate_retry") {
      const c = await createMandateRetryCase({ merchantId: merchant.id, amountInr: 1499 });
      const full = await prisma.recoveryCase.findUnique({ where: { id: c.id }, include: caseInclude });
      return { ok: true, scenario, case: full ? formatCaseBrief(full) : null, message: summary };
    }
    if (scenario === "b2b_invoice") {
      const c = await createB2BInvoiceCase({
        merchantId: merchant.id,
        amountInr: 85000,
        buyerCompany: "Acme Traders Pvt Ltd",
        invoiceNumber: `INV-DEMO-${Date.now().toString().slice(-6)}`,
        buyerEmail: "accounts@acmetraders.demo",
        dueDaysAgo: 21,
      });
      const full = await prisma.recoveryCase.findUnique({ where: { id: c.id }, include: caseInclude });
      return { ok: true, scenario, case: full ? formatCaseBrief(full) : null, message: summary };
    }

    // promise_to_pay via recoverable + setPromise
    const suffix = `${Date.now()}`;
    const paymentId = `pay_asst_ptp_${suffix}`;
    const failPayload = {
      event: "payment.failed",
      id: `evt_asst_ptp_${suffix}`,
      payload: {
        payment: {
          entity: {
            id: paymentId,
            amount: 249900,
            currency: "INR",
            status: "failed",
            method: "card",
            error_reason: "insufficient funds",
            email: LOYAL_DEMO_EMAIL,
            contact: "+919876543210",
          },
        },
      },
    };
    const stored = await prisma.webhookEvent.create({
      data: { eventId: failPayload.id, eventType: failPayload.event, payload: failPayload as object },
    });
    await startRecoveryWorkflow({ webhookEventId: stored.id, payload: failPayload });
    await prisma.webhookEvent.update({
      where: { id: stored.id },
      data: { processed: true, processedAt: new Date() },
    });
    const created = await prisma.recoveryCase.findFirst({
      where: { payment: { razorpayPaymentId: paymentId } },
      orderBy: { createdAt: "desc" },
    });
    if (created) {
      const promiseAt = new Date();
      promiseAt.setUTCDate(promiseAt.getUTCDate() + 1);
      await setPromiseToPay({
        caseId: created.id,
        promiseToPayAt: promiseAt,
        note: "Customer promised tomorrow (assistant demo)",
        setBy: "assistant",
      });
    }
    const full = created
      ? await prisma.recoveryCase.findUnique({ where: { id: created.id }, include: caseInclude })
      : null;
    return { ok: true, scenario, case: full ? formatCaseBrief(full) : null, message: summary };
  }

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

  if (scenario === "full_recovery" && recoveryCase) {
    const executionOk =
      recoveryCase.status === "WAITING_FOR_WEBHOOK" ||
      recoveryCase.actions.some(
        (a) =>
          a.policyDecision === "APPROVED" &&
          (a.status === "executed" || a.status === "succeeded") &&
          !!a.razorpayRefId
      );

    if (executionOk) {
      const capturePayload = {
        event: "payment.captured",
        id: `evt_asst_capture_${suffix}`,
        payload: {
          payment: {
            entity: {
              id: `pay_asst_capture_${suffix}`,
              amount: amountPaise,
              currency: "INR",
              status: "captured",
              method: "card",
              notes: { recovery_case_id: recoveryCase.id, source: "assistant_demo" },
            },
          },
        },
      };
      const captureEvent = await prisma.webhookEvent.create({
        data: {
          eventId: capturePayload.id,
          eventType: capturePayload.event,
          payload: capturePayload as object,
        },
      });
      await startRecoveryWorkflow({ webhookEventId: captureEvent.id, payload: capturePayload });
      await prisma.webhookEvent.update({
        where: { id: captureEvent.id },
        data: { processed: true, processedAt: new Date() },
      });
    } else {
      await writeAudit({
        recoveryCaseId: recoveryCase.id,
        eventType: "demo.capture_fallback",
        message:
          "Razorpay execution did not succeed — assistant full_recovery using simulate capture",
        metadata: { priorStatus: recoveryCase.status },
      });
      await simulateCapture({ caseId: recoveryCase.id, confirmed: true, allowFailed: true });
    }

    const closed = await prisma.recoveryCase.findUnique({
      where: { id: recoveryCase.id },
      include: caseInclude,
    });
    return {
      ok: true,
      scenario,
      case: closed ? formatCaseBrief(closed) : null,
      message: summary,
    };
  }

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
        retryScheduleDays: "1,3,7",
        maxRecoveryAmount: 50000,
        requireHumanAbove: 25000,
        maxInvoiceReminders: 3,
        allowPaymentLink: true,
        notifyCustomerSms: true,
        notifyCustomerEmail: true,
      },
    });
  }

  const retryScheduleDays =
    args.retryScheduleDays != null
      ? String(args.retryScheduleDays)
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n >= 0)
          .join(",") || policy.retryScheduleDays
      : policy.retryScheduleDays;

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
    retryScheduleDays,
    maxInvoiceReminders:
      args.maxInvoiceReminders != null
        ? Number(args.maxInvoiceReminders)
        : policy.maxInvoiceReminders,
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
  if (
    !Number.isInteger(next.maxInvoiceReminders) ||
    next.maxInvoiceReminders < 1 ||
    next.maxInvoiceReminders > 10
  ) {
    return { error: "maxInvoiceReminders must be 1–10" };
  }

  const summary = `Update policy → human>₹${next.requireHumanAbove.toLocaleString("en-IN")}, reject>₹${next.maxRecoveryAmount.toLocaleString("en-IN")}, retries=${next.maxRetries}, schedule=${next.retryScheduleDays}, invoiceReminders=${next.maxInvoiceReminders}`;
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
      retryScheduleDays: updated.retryScheduleDays,
      maxRecoveryAmount: updated.maxRecoveryAmount,
      requireHumanAbove: updated.requireHumanAbove,
      maxInvoiceReminders: updated.maxInvoiceReminders,
      allowPaymentLink: updated.allowPaymentLink,
      notifyCustomerSms: updated.notifyCustomerSms,
      notifyCustomerEmail: updated.notifyCustomerEmail,
    },
    message: summary,
  };
}

export async function setPromiseToPayTool(args: Record<string, unknown>) {
  const caseId = String(args.caseId ?? "").trim();
  const dateRaw = String(args.promiseToPayAt ?? "").trim();
  const note = typeof args.note === "string" ? args.note.trim() : undefined;
  if (!caseId) return { error: "caseId required" };
  if (!dateRaw) return { error: "promiseToPayAt required (ISO date)" };
  const promiseToPayAt = new Date(dateRaw);
  if (Number.isNaN(promiseToPayAt.getTime())) return { error: "Invalid promiseToPayAt" };

  const recoveryCase = await resolveCase(caseId);
  if (!recoveryCase) return { error: `Case not found: ${caseId}` };

  const summary = `Set promise-to-pay on …${recoveryCase.id.slice(-8)} → ${promiseToPayAt.toISOString().slice(0, 10)}`;
  const pending = needsConfirm(
    "set_promise_to_pay",
    { caseId: recoveryCase.id, promiseToPayAt: promiseToPayAt.toISOString(), note },
    summary,
    { caseId: recoveryCase.id, promiseToPayAt: promiseToPayAt.toISOString() }
  );
  if (pending) return pending;

  return setPromiseToPay({
    caseId: recoveryCase.id,
    promiseToPayAt,
    note,
    setBy: "assistant",
  });
}

export async function runSchedulerTickTool(args: Record<string, unknown>) {
  const forceCaseId =
    typeof args.forceCaseId === "string" ? args.forceCaseId.trim() : undefined;
  const summary = forceCaseId
    ? `Run scheduler tick for case …${forceCaseId.slice(-8)}`
    : "Run scheduler tick for all due PTP / mandate / B2B actions";
  const pending = needsConfirm("run_scheduler_tick", { ...args, forceCaseId }, summary, {
    forceCaseId: forceCaseId ?? null,
  });
  if (pending) return pending;

  const result = await processDueActions({ forceCaseId, limit: 20 });
  return {
    ok: true,
    ...result,
    message: `Scheduler processed ${result.processed} action(s)`,
  };
}

export async function listMyAssigned(args: Record<string, unknown>) {
  const assignedTo =
    String(args.assignedTo ?? "").trim() ||
    process.env.MERCHANT_NAME ||
    "Demo Merchant";
  const needle = assignedTo.toLowerCase();
  const cases = await prisma.recoveryCase.findMany({
    where: {
      status: "ESCALATED",
      assignedTo: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: caseInclude,
  });
  const mine = cases.filter((c) => (c.assignedTo ?? "").toLowerCase() === needle);
  return {
    assignedTo,
    count: mine.length,
    cases: mine.slice(0, 25).map((c) => ({ ...formatCaseBrief(c), assignedTo: c.assignedTo })),
  };
}

export async function simulateCapture(args: Record<string, unknown>) {
  const recoveryCase = await resolveCase(String(args.caseId ?? ""));
  if (!recoveryCase) return { error: `Case not found: ${args.caseId}` };
  const allowFailed = args.allowFailed === true || args.allowFailed === "true";
  const allowedStatuses = allowFailed
    ? ["WAITING_FOR_WEBHOOK", "FAILED", "EXECUTING"]
    : ["WAITING_FOR_WEBHOOK"];
  if (!allowedStatuses.includes(recoveryCase.status)) {
    return {
      error: `Case …${recoveryCase.id.slice(-8)} is ${recoveryCase.status}. Simulate capture only works when status is ${allowedStatuses.join(" / ")}.`,
    };
  }

  const summary = `Simulate payment.captured → mark …${recoveryCase.id.slice(-8)} RECOVERED (₹${recoveryCase.amount / 100})`;
  const pending = needsConfirm(
    "simulate_capture",
    { ...args, caseId: recoveryCase.id },
    summary,
    { caseId: recoveryCase.id, amountInr: recoveryCase.amount / 100 }
  );
  if (pending) return pending;

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      status: "RECOVERED",
      recoveredAmount: recoveryCase.amount,
      nextActionAt: null,
      promiseToPayAt: null,
    },
  });
  await prisma.recoveryResult.create({
    data: {
      recoveryCaseId: recoveryCase.id,
      success: true,
      recoveredAmount: recoveryCase.amount,
      notes: allowFailed
        ? "Simulated payment.captured (assistant / execution fallback)"
        : "Simulated payment.captured (assistant)",
    },
  });
  await prisma.recoveryAction.updateMany({
    where: {
      recoveryCaseId: recoveryCase.id,
      status: { in: ["executed", "queued", "waiting", "failed"] },
    },
    data: { status: "succeeded" },
  });
  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "recovery.confirmed",
    message: `RakshaPay agent simulated recovery of ₹${recoveryCase.amount / 100}`,
    metadata: { source: "assistant", allowFailed },
  });

  return {
    ok: true,
    caseId: recoveryCase.id,
    recoveredAmount: recoveryCase.amount / 100,
    message: summary,
  };
}

export async function resendPaymentLink(args: Record<string, unknown>) {
  const recoveryCase = await resolveCase(String(args.caseId ?? ""));
  if (!recoveryCase) return { error: `Case not found: ${args.caseId}` };

  const allowed = ["WAITING_FOR_WEBHOOK", "FAILED", "EXECUTING"];
  if (!allowed.includes(recoveryCase.status)) {
    return {
      error: `Cannot resend link for status ${recoveryCase.status}. Need WAITING_FOR_WEBHOOK / FAILED.`,
    };
  }

  const summary = `Resend recovery payment link for …${recoveryCase.id.slice(-8)} (₹${recoveryCase.amount / 100}) — SMS/Email per policy`;
  const pending = needsConfirm(
    "resend_payment_link",
    { ...args, caseId: recoveryCase.id },
    summary,
    { caseId: recoveryCase.id, status: recoveryCase.status }
  );
  if (pending) return pending;

  const execAction: RecoveryActionType =
    recoveryCase.recommendedAction &&
    recoveryCase.recommendedAction !== "STOP" &&
    recoveryCase.recommendedAction !== "HUMAN_ESCALATION"
      ? (recoveryCase.recommendedAction as RecoveryActionType)
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
        resend: true,
        source: "assistant",
        ...(execution.metadata ?? {}),
      },
    },
  });

  if (execution.ok) {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "WAITING_FOR_WEBHOOK", attemptCount: { increment: 1 } },
    });
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: "recovery.link_resent",
      message: `RakshaPay agent resent payment link${execution.shortUrl ? `: ${execution.shortUrl}` : ""}`,
      metadata: {
        source: "assistant",
        shortUrl: execution.shortUrl,
        razorpayRefId: execution.razorpayRefId,
      },
    });
  }

  return {
    ok: execution.ok,
    caseId: recoveryCase.id,
    shortUrl: execution.shortUrl ?? null,
    message: execution.ok
      ? `${summary}${execution.shortUrl ? ` → ${execution.shortUrl}` : ""}`
      : execution.message || "Failed to create payment link",
  };
}

export async function reassignCase(args: Record<string, unknown>) {
  const assignedTo = String(args.assignedTo ?? "").trim();
  const assignedToRole = String(args.assignedToRole ?? "Merchant").trim() || "Merchant";
  if (!assignedTo) return { error: "assignedTo is required" };

  const recoveryCase = await resolveCase(String(args.caseId ?? ""));
  if (!recoveryCase) return { error: `Case not found: ${args.caseId}` };
  if (recoveryCase.status !== "ESCALATED") {
    return { error: `Case is ${recoveryCase.status}, not ESCALATED` };
  }

  const summary = `Reassign …${recoveryCase.id.slice(-8)} → ${assignedTo} (${assignedToRole})`;
  const pending = needsConfirm(
    "reassign_case",
    { ...args, caseId: recoveryCase.id, assignedTo, assignedToRole },
    summary,
    { from: recoveryCase.assignedTo, to: assignedTo }
  );
  if (pending) return pending;

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      assignedTo,
      assignedToRole,
      assignedAt: new Date(),
      assignmentMode: "MANUAL",
    },
  });
  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "review.reassigned",
    message: `RakshaPay agent reassigned from ${recoveryCase.assignedTo ?? "unassigned"} to ${assignedTo}`,
    metadata: { assignedTo, assignedToRole, source: "assistant" },
  });

  return { ok: true, caseId: recoveryCase.id, assignedTo, message: summary };
}

export async function unassignCase(args: Record<string, unknown>) {
  const recoveryCase = await resolveCase(String(args.caseId ?? ""));
  if (!recoveryCase) return { error: `Case not found: ${args.caseId}` };
  if (recoveryCase.status !== "ESCALATED") {
    return { error: `Case is ${recoveryCase.status}, not ESCALATED` };
  }
  if (!recoveryCase.assignedTo) {
    return { ok: true, caseId: recoveryCase.id, message: "Case was already unassigned" };
  }

  const summary = `Unassign …${recoveryCase.id.slice(-8)} (was ${recoveryCase.assignedTo})`;
  const pending = needsConfirm(
    "unassign_case",
    { ...args, caseId: recoveryCase.id },
    summary,
    { was: recoveryCase.assignedTo }
  );
  if (pending) return pending;

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      assignedTo: null,
      assignedToRole: null,
      assignedAt: null,
      assignmentMode: null,
    },
  });
  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "review.unassigned",
    message: `RakshaPay agent unassigned ${recoveryCase.assignedTo}`,
    metadata: { source: "assistant" },
  });

  return { ok: true, caseId: recoveryCase.id, message: summary };
}

export async function bulkReview(args: Record<string, unknown>) {
  const action = String(args.action ?? "").toLowerCase();
  const notes = String(args.notes ?? "").trim();
  const reviewedBy =
    String(args.reviewedBy ?? "").trim() ||
    process.env.MERCHANT_NAME ||
    "Demo Merchant";

  if (!["approve", "reject"].includes(action)) {
    return { error: "bulk_review action must be approve or reject" };
  }

  const queue = await prisma.recoveryCase.findMany({
    where: {
      status: "ESCALATED",
      AND: [{ assignedTo: { not: null } }, { assignedTo: { not: "" } }],
    },
    orderBy: { updatedAt: "desc" },
    take: 25,
    include: { customer: true },
  });

  if (!queue.length) {
    return { ok: true, processed: 0, message: "No assigned escalated cases to bulk review" };
  }

  const summary = `Bulk ${action.toUpperCase()} ${queue.length} assigned escalated case(s) as ${reviewedBy}`;
  const pending = needsConfirm(
    "bulk_review",
    { ...args, action, notes, reviewedBy },
    summary,
    { count: queue.length, caseIds: queue.map((c) => c.id) }
  );
  if (pending) return pending;

  const results: { caseId: string; ok: boolean; error?: string }[] = [];
  for (const c of queue) {
    const one = await reviewCase({
      caseId: c.id,
      action,
      notes,
      reviewedBy,
      confirmed: true,
    });
    if (one && typeof one === "object" && (one as { error?: string }).error) {
      results.push({ caseId: c.id, ok: false, error: String((one as { error: string }).error) });
    } else {
      results.push({ caseId: c.id, ok: true });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return {
    ok: okCount > 0,
    processed: okCount,
    total: queue.length,
    results,
    message: `Bulk ${action}: ${okCount}/${queue.length} succeeded`,
  };
}

export function navigateUi(args: Record<string, unknown>) {
  const tab = String(args.tab ?? "").trim().toLowerCase();
  const allowed = ["overview", "cases", "review", "audit", "assistant", "evaluation", "settings"];
  if (!allowed.includes(tab)) {
    return { error: `tab must be one of: ${allowed.join(", ")}` };
  }
  const filter = args.filter != null ? String(args.filter).trim().toUpperCase() : undefined;
  const caseId = args.caseId != null ? String(args.caseId).trim() : undefined;
  const assignedOnly =
    args.assignedOnly === true ||
    args.assignedOnly === "true" ||
    filter === "ASSIGNED" ||
    filter === "MY_ASSIGNED";

  return {
    ok: true,
    message: `Opening ${tab}${assignedOnly ? " (my assigned)" : filter ? ` (${filter})` : ""}${caseId ? ` · case …${caseId.slice(-8)}` : ""}`,
    uiAction: {
      type: "navigate" as const,
      tab,
      filter: assignedOnly ? "ASSIGNED" : filter && filter !== "ASSIGNED" && filter !== "MY_ASSIGNED" ? filter : undefined,
      assignedOnly: assignedOnly || undefined,
      caseId: caseId || undefined,
    },
  };
}

export async function exportAudit(args: Record<string, unknown>) {
  const limit = Math.min(Math.max(Number(args.limit ?? 200) || 200, 1), 500);
  const caseIdRaw = typeof args.caseId === "string" ? args.caseId.trim() : "";
  let recoveryCaseId: string | undefined;
  if (caseIdRaw) {
    const found = await resolveCase(caseIdRaw);
    recoveryCaseId = found?.id;
  }

  const logs = await prisma.auditLog.findMany({
    where: recoveryCaseId ? { recoveryCaseId } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const events = logs.map((a) => ({
    id: a.id,
    recoveryCaseId: a.recoveryCaseId,
    eventType: a.eventType,
    message: a.message,
    createdAt: a.createdAt.toISOString(),
    metadata: a.metadata,
  }));
  const filename = `audit-trail-${new Date().toISOString().slice(0, 10)}.json`;

  return {
    ok: true,
    count: events.length,
    message: `Prepared ${events.length} audit events for download`,
    uiAction: {
      type: "export_audit" as const,
      filename,
      data: events,
    },
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
      "Trigger a demo: recoverable | escalate | reject | full_recovery | abandoned | mandate_retry | b2b_invoice | promise_to_pay. Requires confirmed=true.",
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
      "Update merchant policy guardrails (thresholds, retries, notify SMS/Email). Pass only fields to change. Requires confirmed=true.",
    parameters: {
      type: "OBJECT",
      properties: {
        maxRetries: { type: "NUMBER" },
        maxRecoveryAmount: { type: "NUMBER" },
        requireHumanAbove: { type: "NUMBER" },
        allowPaymentLink: { type: "BOOLEAN" },
        notifyCustomerSms: { type: "BOOLEAN" },
        notifyCustomerEmail: { type: "BOOLEAN" },
        retryScheduleDays: { type: "STRING", description: 'e.g. "1,3,7"' },
        maxInvoiceReminders: { type: "NUMBER" },
        confirmed: { type: "BOOLEAN" },
      },
    },
  },
  {
    name: "list_due_actions",
    description: "List cases with due promise-to-pay, mandate retries, or B2B reminders.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "set_promise_to_pay",
    description:
      "Record a customer promise-to-pay date on a case. Requires confirmed=true. ISO date in promiseToPayAt.",
    parameters: {
      type: "OBJECT",
      properties: {
        caseId: { type: "STRING" },
        promiseToPayAt: { type: "STRING" },
        note: { type: "STRING" },
        confirmed: { type: "BOOLEAN" },
      },
      required: ["caseId", "promiseToPayAt"],
    },
  },
  {
    name: "run_scheduler_tick",
    description:
      "Process due PTP / mandate / B2B sequencer actions. Optional forceCaseId for demo. Requires confirmed=true.",
    parameters: {
      type: "OBJECT",
      properties: {
        forceCaseId: { type: "STRING" },
        confirmed: { type: "BOOLEAN" },
      },
    },
  },
  {
    name: "list_my_assigned",
    description: "List escalated cases assigned to the merchant (or given assignedTo name).",
    parameters: {
      type: "OBJECT",
      properties: {
        assignedTo: { type: "STRING" },
      },
    },
  },
  {
    name: "simulate_capture",
    description:
      "Dev helper: mark a WAITING_FOR_WEBHOOK case as RECOVERED (simulates payment.captured). Requires confirmed=true.",
    parameters: {
      type: "OBJECT",
      properties: {
        caseId: { type: "STRING" },
        confirmed: { type: "BOOLEAN" },
      },
      required: ["caseId"],
    },
  },
  {
    name: "resend_payment_link",
    description:
      "Create/resend a Razorpay recovery payment link (SMS/Email per policy) for WAITING_FOR_WEBHOOK or FAILED cases. Requires confirmed=true.",
    parameters: {
      type: "OBJECT",
      properties: {
        caseId: { type: "STRING" },
        confirmed: { type: "BOOLEAN" },
      },
      required: ["caseId"],
    },
  },
  {
    name: "reassign_case",
    description: "Reassign an ESCALATED case to another reviewer. Requires confirmed=true.",
    parameters: {
      type: "OBJECT",
      properties: {
        caseId: { type: "STRING" },
        assignedTo: { type: "STRING" },
        assignedToRole: { type: "STRING" },
        confirmed: { type: "BOOLEAN" },
      },
      required: ["caseId", "assignedTo"],
    },
  },
  {
    name: "unassign_case",
    description: "Clear reviewer assignment on an ESCALATED case. Requires confirmed=true.",
    parameters: {
      type: "OBJECT",
      properties: {
        caseId: { type: "STRING" },
        confirmed: { type: "BOOLEAN" },
      },
      required: ["caseId"],
    },
  },
  {
    name: "bulk_review",
    description:
      "Approve or reject ALL currently assigned escalated cases. Prefer Review page for careful single reviews. Requires confirmed=true.",
    parameters: {
      type: "OBJECT",
      properties: {
        action: { type: "STRING", description: "approve | reject" },
        notes: { type: "STRING" },
        reviewedBy: { type: "STRING" },
        confirmed: { type: "BOOLEAN" },
      },
      required: ["action"],
    },
  },
  {
    name: "navigate_ui",
    description:
      "Open a dashboard tab for the merchant. tab=overview|cases|review|audit|assistant|evaluation|settings. Optional filter=ESCALATED|RECOVERED|ASSIGNED|WAITING_FOR_WEBHOOK, assignedOnly=true, caseId.",
    parameters: {
      type: "OBJECT",
      properties: {
        tab: { type: "STRING" },
        filter: { type: "STRING" },
        assignedOnly: { type: "BOOLEAN" },
        caseId: { type: "STRING" },
      },
      required: ["tab"],
    },
  },
  {
    name: "export_audit",
    description: "Prepare audit trail JSON for the merchant to download in the UI.",
    parameters: {
      type: "OBJECT",
      properties: {
        caseId: { type: "STRING" },
        limit: { type: "NUMBER" },
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
    case "list_my_assigned":
      return listMyAssigned(args);
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
    case "list_due_actions":
      return listDueActions(25);
    case "set_promise_to_pay":
      return setPromiseToPayTool(args);
    case "run_scheduler_tick":
      return runSchedulerTickTool(args);
    case "simulate_capture":
      return simulateCapture(args);
    case "resend_payment_link":
      return resendPaymentLink(args);
    case "reassign_case":
      return reassignCase(args);
    case "unassign_case":
      return unassignCase(args);
    case "bulk_review":
      return bulkReview(args);
    case "navigate_ui":
      return navigateUi(args);
    case "export_audit":
      return exportAudit(args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
