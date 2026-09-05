import type { Policy, RecoveryActionType, RecoveryCase } from "@prisma/client";
import { prisma } from "../db.js";
import { writeAudit } from "../audit/audit.service.js";
import { executeRecoveryAction } from "./recovery.executor.js";

export function parseRetrySchedule(raw?: string | null): number[] {
  const fallback = [1, 3, 7];
  if (!raw?.trim()) return fallback;
  const days = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return days.length ? days : fallback;
}

export function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function getMerchantPolicy(merchantId: string) {
  const policy = await prisma.policy.findFirst({
    where: { merchantId, active: true },
    orderBy: { updatedAt: "desc" },
  });
  return (
    policy ??
    ({
      maxRetries: 2,
      retryScheduleDays: "1,3,7",
      maxRecoveryAmount: 50000,
      allowPaymentLink: true,
      requireHumanAbove: 25000,
      maxInvoiceReminders: 3,
      notifyCustomerSms: true,
      notifyCustomerEmail: true,
    } as Pick<
      Policy,
      | "maxRetries"
      | "retryScheduleDays"
      | "maxRecoveryAmount"
      | "allowPaymentLink"
      | "requireHumanAbove"
      | "maxInvoiceReminders"
      | "notifyCustomerSms"
      | "notifyCustomerEmail"
    >)
  );
}

async function loadCase(caseId: string) {
  return prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: { customer: true, payment: true },
  });
}

async function sendChaseLink(params: {
  recoveryCase: RecoveryCase & {
    customer?: { name: string | null; email: string | null; phone: string | null } | null;
  };
  action: RecoveryActionType;
  auditEvent: string;
  auditMessage: string;
  metadata?: Record<string, unknown>;
}) {
  const { recoveryCase, action, auditEvent, auditMessage, metadata } = params;
  const execution = await executeRecoveryAction({
    recoveryCaseId: recoveryCase.id,
    action: action === "REMINDER" || action === "WAIT" ? "PAYMENT_LINK" : action,
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
      actionType: action,
      policyDecision: "APPROVED",
      status: execution.status,
      razorpayRefId: execution.razorpayRefId,
      metadata: {
        message: execution.message,
        shortUrl: execution.shortUrl,
        ...(metadata ?? {}),
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
        promiseToPayAt: null,
        nextActionAt: null,
      },
    });
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: auditEvent,
      message: auditMessage,
      metadata: {
        shortUrl: execution.shortUrl,
        razorpayRefId: execution.razorpayRefId,
        ...(metadata ?? {}),
      },
    });
  } else {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "FAILED" },
    });
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: "recovery.failed",
      message: execution.message,
    });
  }

  return execution;
}

/** Merchant records a customer promise-to-pay date. */
export async function setPromiseToPay(params: {
  caseId: string;
  promiseToPayAt: Date;
  note?: string;
  setBy?: string;
}) {
  const recoveryCase = await loadCase(params.caseId);
  if (!recoveryCase) return { error: "Case not found" };

  const closed = ["RECOVERED", "REJECTED"].includes(recoveryCase.status);
  if (closed) return { error: `Case is ${recoveryCase.status} — cannot set promise` };

  if (Number.isNaN(params.promiseToPayAt.getTime())) {
    return { error: "Invalid promiseToPayAt date" };
  }

  const updated = await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      status: "WAITING_PROMISE",
      promiseToPayAt: params.promiseToPayAt,
      promiseNote: params.note?.trim() || null,
      nextActionAt: params.promiseToPayAt,
      caseSource:
        recoveryCase.caseSource === "PAYMENT_FAILED"
          ? "PROMISE_TO_PAY"
          : recoveryCase.caseSource,
    },
  });

  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "promise.set",
    message: `Promise-to-pay set for ${params.promiseToPayAt.toISOString().slice(0, 10)}${
      params.note ? `: ${params.note}` : ""
    }`,
    metadata: {
      promiseToPayAt: params.promiseToPayAt.toISOString(),
      note: params.note ?? null,
      setBy: params.setBy ?? null,
    },
  });

  return {
    ok: true,
    caseId: updated.id,
    promiseToPayAt: updated.promiseToPayAt?.toISOString() ?? null,
    status: updated.status,
    message: `Promise-to-pay recorded for ${params.promiseToPayAt.toISOString().slice(0, 10)}`,
  };
}

/** Schedule the next mandate retry step (or stop / escalate). */
export async function scheduleMandateRetry(params: {
  caseId: string;
  /** Demo: treat "now" as advanced by this many days */
  fromDate?: Date;
}) {
  const recoveryCase = await loadCase(params.caseId);
  if (!recoveryCase) return { error: "Case not found" };
  const policy = await getMerchantPolicy(recoveryCase.merchantId);
  const schedule = parseRetrySchedule(policy.retryScheduleDays);
  const from = params.fromDate ?? new Date();
  const nextIndex = recoveryCase.retrySequenceIndex;

  if (nextIndex >= schedule.length || recoveryCase.attemptCount >= policy.maxRetries) {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: {
        status: "ESCALATED",
        nextActionAt: null,
        recommendedAction: "HUMAN_ESCALATION",
      },
    });
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: "mandate.sequence_exhausted",
      message: `Mandate retry sequence exhausted (${schedule.join(",")} days, maxRetries=${policy.maxRetries}) → escalate`,
      metadata: { schedule, maxRetries: policy.maxRetries, attemptCount: recoveryCase.attemptCount },
    });
    return {
      ok: true,
      stopped: true,
      escalated: true,
      message: "Sequence exhausted — escalated to human",
    };
  }

  const dayOffset = schedule[nextIndex] ?? 1;
  const nextAt = addDays(from, dayOffset);

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      status: "WAITING_RETRY",
      caseSource: "MANDATE_RETRY",
      nextActionAt: nextAt,
      recommendedAction: "RETRY_PAYMENT",
    },
  });

  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "mandate.retry_scheduled",
    message: `Mandate retry #${nextIndex + 1} scheduled in ${dayOffset} day(s) → ${nextAt.toISOString().slice(0, 10)}`,
    metadata: { dayOffset, nextIndex, nextActionAt: nextAt.toISOString(), schedule },
  });

  return {
    ok: true,
    nextActionAt: nextAt.toISOString(),
    dayOffset,
    sequenceIndex: nextIndex,
    message: `Next mandate retry in ${dayOffset} day(s)`,
  };
}

async function runMandateDue(caseId: string) {
  const recoveryCase = await loadCase(caseId);
  if (!recoveryCase) return { error: "Case not found" };
  const policy = await getMerchantPolicy(recoveryCase.merchantId);
  const schedule = parseRetrySchedule(policy.retryScheduleDays);

  if (
    recoveryCase.retrySequenceIndex >= schedule.length ||
    recoveryCase.attemptCount >= policy.maxRetries
  ) {
    return scheduleMandateRetry({ caseId });
  }

  const step = recoveryCase.retrySequenceIndex;
  const dayOffset = schedule[step] ?? 1;

  const execution = await sendChaseLink({
    recoveryCase,
    action: "RETRY_PAYMENT",
    auditEvent: "mandate.retry_executed",
    auditMessage: `Mandate retry #${step + 1} (day ${dayOffset}) executed`,
    metadata: { sequenceIndex: step, dayOffset },
  });

  if (!execution.ok) return { ok: false, message: execution.message };

  const nextIndex = step + 1;
  await prisma.recoveryCase.update({
    where: { id: caseId },
    data: { retrySequenceIndex: nextIndex },
  });

  // Schedule following step if any remain under maxRetries
  const refreshed = await loadCase(caseId);
  if (
    refreshed &&
    nextIndex < schedule.length &&
    refreshed.attemptCount < policy.maxRetries
  ) {
    await scheduleMandateRetry({ caseId });
  } else if (refreshed) {
    // Keep waiting for webhook; if no capture, a later tick can escalate
    await prisma.recoveryCase.update({
      where: { id: caseId },
      data: { nextActionAt: null },
    });
  }

  return {
    ok: true,
    message: `Mandate retry #${step + 1} sent`,
    shortUrl: execution.shortUrl ?? null,
  };
}

async function runPromiseDue(caseId: string) {
  const recoveryCase = await loadCase(caseId);
  if (!recoveryCase) return { error: "Case not found" };

  await writeAudit({
    recoveryCaseId: caseId,
    eventType: "promise.due",
    message: `Promise-to-pay due — chasing payment`,
    metadata: {
      promiseToPayAt: recoveryCase.promiseToPayAt?.toISOString() ?? null,
      note: recoveryCase.promiseNote,
    },
  });

  const execution = await sendChaseLink({
    recoveryCase,
    action: "PAYMENT_LINK",
    auditEvent: "promise.chased",
    auditMessage: `Promise-to-pay follow-up payment link sent`,
    metadata: { promiseNote: recoveryCase.promiseNote },
  });

  return {
    ok: execution.ok,
    message: execution.ok ? "Promise due — payment link resent" : execution.message,
    shortUrl: execution.shortUrl ?? null,
  };
}

async function runB2BReminder(caseId: string) {
  const recoveryCase = await loadCase(caseId);
  if (!recoveryCase) return { error: "Case not found" };
  const policy = await getMerchantPolicy(recoveryCase.merchantId);
  const reminderCount = await prisma.recoveryAction.count({
    where: { recoveryCaseId: caseId, actionType: "REMINDER" },
  });

  if (reminderCount >= policy.maxInvoiceReminders) {
    await prisma.recoveryCase.update({
      where: { id: caseId },
      data: {
        status: "ESCALATED",
        nextActionAt: null,
        recommendedAction: "HUMAN_ESCALATION",
      },
    });
    await writeAudit({
      recoveryCaseId: caseId,
      eventType: "b2b.escalated",
      message: `B2B invoice reminders exhausted (${reminderCount}/${policy.maxInvoiceReminders}) → escalate`,
      metadata: {
        invoiceNumber: recoveryCase.invoiceNumber,
        buyerCompany: recoveryCase.buyerCompany,
      },
    });
    return { ok: true, escalated: true, message: "B2B reminders exhausted — escalated" };
  }

  const execution = await sendChaseLink({
    recoveryCase,
    action: "REMINDER",
    auditEvent: "b2b.reminder_sent",
    auditMessage: `B2B invoice reminder #${reminderCount + 1} for ${
      recoveryCase.invoiceNumber ?? "invoice"
    } (${recoveryCase.buyerCompany ?? "buyer"})`,
    metadata: {
      reminderNumber: reminderCount + 1,
      invoiceNumber: recoveryCase.invoiceNumber,
      buyerCompany: recoveryCase.buyerCompany,
    },
  });

  if (execution.ok) {
    // Next reminder in 3 days (demo can tick early)
    const nextAt = addDays(new Date(), 3);
    await prisma.recoveryCase.update({
      where: { id: caseId },
      data: {
        nextActionAt: nextAt,
        status: "WAITING_FOR_WEBHOOK",
      },
    });
  }

  return {
    ok: execution.ok,
    message: execution.ok
      ? `B2B reminder #${reminderCount + 1} sent`
      : execution.message,
    shortUrl: execution.shortUrl ?? null,
  };
}

export async function listDueActions(limit = 25) {
  const now = new Date();
  const due = await prisma.recoveryCase.findMany({
    where: {
      nextActionAt: { lte: now },
      status: { in: ["WAITING_PROMISE", "WAITING_RETRY", "WAITING_FOR_WEBHOOK", "FAILED"] },
      NOT: { status: { in: ["RECOVERED", "REJECTED"] } },
    },
    orderBy: { nextActionAt: "asc" },
    take: limit,
    include: { customer: true },
  });

  return due.map((c) => ({
    id: c.id,
    status: c.status,
    caseSource: c.caseSource,
    amountInr: c.amount / 100,
    nextActionAt: c.nextActionAt?.toISOString() ?? null,
    promiseToPayAt: c.promiseToPayAt?.toISOString() ?? null,
    retrySequenceIndex: c.retrySequenceIndex,
    invoiceNumber: c.invoiceNumber,
    buyerCompany: c.buyerCompany,
    diagnosis: c.diagnosis,
  }));
}

/**
 * Process due PTP / mandate / B2B actions.
 * @param forceCaseId process one case even if nextActionAt is in the future (demo)
 */
export async function processDueActions(params?: {
  forceCaseId?: string;
  limit?: number;
}) {
  const results: { caseId: string; ok: boolean; message: string }[] = [];

  if (params?.forceCaseId) {
    const c = await loadCase(params.forceCaseId);
    if (!c) return { processed: 0, results: [{ caseId: params.forceCaseId, ok: false, message: "Not found" }] };
    const one = await processOneDue(c.id, c.caseSource, c.status);
    results.push({ caseId: c.id, ...one });
    return { processed: results.length, results };
  }

  const due = await listDueActions(params?.limit ?? 20);
  for (const row of due) {
    const one = await processOneDue(row.id, row.caseSource, row.status);
    results.push({ caseId: row.id, ...one });
  }
  return { processed: results.length, results };
}

async function processOneDue(
  caseId: string,
  caseSource: string,
  status: string
): Promise<{ ok: boolean; message: string }> {
  try {
    if (caseSource === "B2B_INVOICE") {
      const r = await runB2BReminder(caseId);
      return {
        ok: !("error" in (r as object) && (r as { error?: string }).error),
        message: String(
          (r as { message?: string }).message ?? (r as { error?: string }).error ?? "done"
        ),
      };
    }
    if (status === "WAITING_PROMISE" || caseSource === "PROMISE_TO_PAY") {
      const r = await runPromiseDue(caseId);
      return {
        ok: !("error" in (r as object) && (r as { error?: string }).error),
        message: String(
          (r as { message?: string }).message ?? (r as { error?: string }).error ?? "done"
        ),
      };
    }
    if (caseSource === "MANDATE_RETRY" || status === "WAITING_RETRY") {
      const r = await runMandateDue(caseId);
      return {
        ok: !("error" in (r as object) && (r as { error?: string }).error),
        message: String(
          (r as { message?: string }).message ?? (r as { error?: string }).error ?? "done"
        ),
      };
    }
    return { ok: false, message: `No sequencer handler for ${caseSource}/${status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "tick failed" };
  }
}

/** Create a B2B overdue invoice recovery case (demo / API). */
export async function createB2BInvoiceCase(params: {
  merchantId: string;
  amountInr: number;
  buyerCompany: string;
  invoiceNumber: string;
  buyerEmail?: string;
  dueDaysAgo?: number;
}) {
  const amountPaise = Math.round(params.amountInr * 100);
  const dueAt = addDays(new Date(), -(params.dueDaysAgo ?? 14));

  let customer = params.buyerEmail
    ? await prisma.customer.findFirst({
        where: { merchantId: params.merchantId, email: params.buyerEmail },
      })
    : null;

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        merchantId: params.merchantId,
        name: params.buyerCompany,
        email: params.buyerEmail ?? `ap@${params.buyerCompany.toLowerCase().replace(/\s+/g, "")}.demo`,
        phone: "+919876543210",
      },
    });
  }

  const recoveryCase = await prisma.recoveryCase.create({
    data: {
      merchantId: params.merchantId,
      customerId: customer.id,
      amount: amountPaise,
      currency: "INR",
      status: "WAITING_RETRY",
      caseSource: "B2B_INVOICE",
      failureReason: "invoice overdue",
      diagnosis: "overdue_receivable",
      diagnosisConfidence: 0.92,
      recommendedAction: "REMINDER",
      expectedRecoveryProbability: 0.55,
      invoiceNumber: params.invoiceNumber,
      buyerCompany: params.buyerCompany,
      invoiceDueAt: dueAt,
      nextActionAt: new Date(), // due immediately for demo chase
      attemptCount: 0,
    },
  });

  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "b2b.case_opened",
    message: `B2B receivable ${params.invoiceNumber} — ${params.buyerCompany} ₹${params.amountInr} overdue since ${dueAt.toISOString().slice(0, 10)}`,
    metadata: {
      invoiceNumber: params.invoiceNumber,
      buyerCompany: params.buyerCompany,
      amountInr: params.amountInr,
      invoiceDueAt: dueAt.toISOString(),
    },
  });

  return recoveryCase;
}

/** Seed a mandate-retry case ready for sequencer ticks. */
export async function createMandateRetryCase(params: {
  merchantId: string;
  amountInr: number;
  customerEmail?: string;
}) {
  const amountPaise = Math.round(params.amountInr * 100);
  const email = params.customerEmail ?? "mandate.demo@rakshapay.com";

  let customer = await prisma.customer.findFirst({
    where: { merchantId: params.merchantId, email },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        merchantId: params.merchantId,
        name: "Mandate Demo Customer",
        email,
        phone: "+919811122233",
        successfulPayments: 4,
      },
    });
  }

  const payment = await prisma.payment.create({
    data: {
      merchantId: params.merchantId,
      customerId: customer.id,
      razorpayPaymentId: `pay_mandate_${Date.now()}`,
      amount: amountPaise,
      currency: "INR",
      status: "failed",
      method: "emandate",
      failureReason: "mandate debit failed",
    },
  });

  const recoveryCase = await prisma.recoveryCase.create({
    data: {
      merchantId: params.merchantId,
      customerId: customer.id,
      paymentId: payment.id,
      amount: amountPaise,
      currency: "INR",
      status: "WAITING_RETRY",
      caseSource: "MANDATE_RETRY",
      failureReason: "mandate debit failed",
      diagnosis: "temporary_payment_failure",
      diagnosisConfidence: 0.88,
      recommendedAction: "RETRY_PAYMENT",
      expectedRecoveryProbability: 0.62,
      retrySequenceIndex: 0,
      nextActionAt: new Date(),
      attemptCount: 0,
    },
  });

  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "mandate.case_opened",
    message: `Mandate retry sequencer armed for ₹${params.amountInr} (schedule from policy)`,
    metadata: { amountInr: params.amountInr },
  });

  // First schedule entry → also set nextActionAt for day offset display, but due now for first tick
  const policy = await getMerchantPolicy(params.merchantId);
  const schedule = parseRetrySchedule(policy.retryScheduleDays);
  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "mandate.sequence_armed",
    message: `Retry schedule: day ${schedule.join(" → day ")} (maxRetries=${policy.maxRetries})`,
    metadata: { schedule, maxRetries: policy.maxRetries },
  });

  return recoveryCase;
}
