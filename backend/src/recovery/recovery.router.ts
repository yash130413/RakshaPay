import { Router } from "express";
import { prisma } from "../db.js";
import { writeAudit } from "../audit/audit.service.js";
import { LOYAL_DEMO_EMAIL } from "../customers/customer.context.js";
import { executeRecoveryAction } from "./recovery.executor.js";
import { startRecoveryWorkflow } from "../workflows/recovery.workflow.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createB2BInvoiceCase,
  createMandateRetryCase,
  listDueActions,
  processDueActions,
  setPromiseToPay,
} from "./sequencer.service.js";

export const recoveryRouter = Router();

const DEMO_REVIEWERS = [
  { id: "collections", name: "Priya Sharma", role: "Collections" },
  { id: "risk", name: "Arjun Mehta", role: "Risk ops" },
] as const;

const caseInclude = {
  actions: true,
  decisions: { orderBy: { createdAt: "asc" as const } },
  audits: { orderBy: { createdAt: "asc" as const } },
  results: true,
  customer: true,
  payment: true,
};

/** Mark a case RECOVERED without a real payment.captured webhook (demo / Razorpay-down fallback). */
async function applySimulatedCapture(caseId: string, notes: string) {
  const recoveryCase = await prisma.recoveryCase.findUnique({ where: { id: caseId } });
  if (!recoveryCase) return null;

  if (recoveryCase.status !== "RECOVERED") {
    await prisma.recoveryCase.update({
      where: { id: caseId },
      data: {
        status: "RECOVERED",
        recoveredAmount: recoveryCase.amount,
        nextActionAt: null,
        promiseToPayAt: null,
      },
    });

    await prisma.recoveryResult.create({
      data: {
        recoveryCaseId: caseId,
        success: true,
        recoveredAmount: recoveryCase.amount,
        notes,
      },
    });

    await prisma.recoveryAction.updateMany({
      where: {
        recoveryCaseId: caseId,
        status: { in: ["executed", "queued", "waiting", "failed"] },
      },
      data: { status: "succeeded" },
    });

    await writeAudit({
      recoveryCaseId: caseId,
      eventType: "recovery.confirmed",
      message: notes,
      metadata: { source: "simulate_capture", amountInr: recoveryCase.amount / 100 },
    });
  }

  return prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      decisions: true,
      actions: true,
      audits: { orderBy: { createdAt: "asc" as const } },
      results: true,
    },
  });
}

recoveryRouter.get(
  "/cases",
  asyncHandler(async (_req, res) => {
  const cases = await prisma.recoveryCase.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      actions: true,
      decisions: { orderBy: { createdAt: "asc" } },
      audits: { orderBy: { createdAt: "asc" }, take: 50 },
      results: true,
      customer: true,
      payment: true,
    },
  });
  res.json(cases);
  })
);

recoveryRouter.get(
  "/cases/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
  const recoveryCase = await prisma.recoveryCase.findUnique({
      where: { id },
    include: {
      decisions: { orderBy: { createdAt: "asc" } },
      actions: true,
      results: true,
      audits: { orderBy: { createdAt: "asc" } },
      customer: true,
      payment: true,
    },
  });

  if (!recoveryCase) {
    return res.status(404).json({ error: "Not found" });
  }

  return res.json(recoveryCase);
  })
);

/**
 * Demo triggers — bypass Razorpay signature so judges can see policy paths live.
 * Scenarios:
 *  - recoverable:   ~₹2,499 → AI decide → policy approve → payment link
 *  - escalate:      ~₹30,000 → policy ESCALATE (human review threshold)
 *  - reject:        ~₹60,000 → policy REJECT (above max recovery amount)
 *  - full_recovery: recoverable + payment.captured verifier → RECOVERED
 *  - abandoned:     ~₹999 checkout abandoned → payment link
 */
recoveryRouter.post(
  "/demo/trigger",
  asyncHandler(async (req, res) => {
  const scenario = (req.body?.scenario as string) ?? "recoverable";

  // --- Sequencer / receivables demos (no payment.failed webhook) ---
  if (scenario === "mandate_retry" || scenario === "b2b_invoice" || scenario === "promise_to_pay") {
    const defaultEmail = process.env.MERCHANT_EMAIL || "demo@rakshapay.com";
    const merchant = await prisma.merchant.upsert({
      where: { email: defaultEmail },
      update: {},
      create: {
        name: process.env.MERCHANT_NAME || "Demo Merchant",
        email: defaultEmail,
        policies: {
          create: {
            name: "default",
            maxRetries: 3,
            retryScheduleDays: "1,3,7",
            maxRecoveryAmount: 50000,
            allowPaymentLink: true,
            requireHumanAbove: 25000,
            maxInvoiceReminders: 3,
            notifyCustomerSms: true,
            notifyCustomerEmail: true,
          },
        },
      },
    });

    if (scenario === "mandate_retry") {
      const recoveryCase = await createMandateRetryCase({
        merchantId: merchant.id,
        amountInr: 1499,
      });
      await writeAudit({
        eventType: "demo.triggered",
        message: `Demo mandate_retry: sequencer armed (₹1499)`,
        metadata: { scenario, caseId: recoveryCase.id },
      });
      const full = await prisma.recoveryCase.findUnique({
        where: { id: recoveryCase.id },
        include: {
          decisions: true,
          actions: true,
          audits: { orderBy: { createdAt: "asc" } },
          results: true,
          customer: true,
        },
      });
      return res.json({
        ok: true,
        scenario,
        label: "Mandate retry sequencer (day 1 → 3 → 7)",
        amountInr: 1499,
        case: full,
      });
    }

    if (scenario === "b2b_invoice") {
      const recoveryCase = await createB2BInvoiceCase({
        merchantId: merchant.id,
        amountInr: 85000,
        buyerCompany: "Acme Traders Pvt Ltd",
        invoiceNumber: `INV-DEMO-${Date.now().toString().slice(-6)}`,
        buyerEmail: "accounts@acmetraders.demo",
        dueDaysAgo: 21,
      });
      await writeAudit({
        eventType: "demo.triggered",
        message: `Demo b2b_invoice: receivable opened`,
        metadata: { scenario, caseId: recoveryCase.id },
      });
      const full = await prisma.recoveryCase.findUnique({
        where: { id: recoveryCase.id },
        include: {
          decisions: true,
          actions: true,
          audits: { orderBy: { createdAt: "asc" } },
          results: true,
          customer: true,
        },
      });
      return res.json({
        ok: true,
        scenario,
        label: "B2B overdue invoice receivable",
        amountInr: 85000,
        case: full,
      });
    }

    // promise_to_pay: create a recoverable waiting case then set PTP for tomorrow
    const suffix = `${Date.now()}`;
    const amountPaise = 2499 * 100;
    const paymentId = `pay_demo_ptp_${suffix}`;
    const failPayload = {
      event: "payment.failed",
      id: `evt_demo_ptp_${suffix}`,
      payload: {
        payment: {
          entity: {
            id: paymentId,
            amount: amountPaise,
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
      data: {
        eventId: failPayload.id,
        eventType: failPayload.event,
        payload: failPayload as object,
      },
    });
    await startRecoveryWorkflow({ webhookEventId: stored.id, payload: failPayload });
    await prisma.webhookEvent.update({
      where: { id: stored.id },
      data: { processed: true, processedAt: new Date() },
    });
    let recoveryCase = await prisma.recoveryCase.findFirst({
      where: { payment: { razorpayPaymentId: paymentId } },
      orderBy: { createdAt: "desc" },
    });
    if (recoveryCase) {
      const promiseAt = new Date();
      promiseAt.setUTCDate(promiseAt.getUTCDate() + 1);
      await setPromiseToPay({
        caseId: recoveryCase.id,
        promiseToPayAt: promiseAt,
        note: "Customer promised to pay tomorrow (demo)",
        setBy: "demo",
      });
      recoveryCase = await prisma.recoveryCase.findUnique({
        where: { id: recoveryCase.id },
        include: {
          decisions: true,
          actions: true,
          audits: { orderBy: { createdAt: "asc" } },
          results: true,
          customer: true,
        },
      });
    }
    await writeAudit({
      eventType: "demo.triggered",
      message: `Demo promise_to_pay: PTP set +1 day`,
      metadata: { scenario, caseId: recoveryCase?.id },
    });
    return res.json({
      ok: true,
      scenario,
      label: "Promise-to-pay tracker (+1 day)",
      amountInr: 2499,
      case: recoveryCase,
    });
  }

  const presets: Record<
    string,
    { amountInr: number; failureReason: string; label: string; email?: string }
  > = {
    recoverable: {
      amountInr: 2499,
      failureReason: "insufficient funds",
      label: "Standard recovery path (loyal customer → retry)",
      email: LOYAL_DEMO_EMAIL,
    },
    escalate: {
      amountInr: 30000,
      failureReason: "card expired",
      label: "Human escalation (amount > ₹25,000)",
    },
    reject: {
      amountInr: 60000,
      failureReason: "bank decline",
      label: "Policy reject (amount > ₹50,000 max)",
    },
    full_recovery: {
      amountInr: 3499,
      failureReason: "insufficient funds",
      label: "Full loop: fail -> AI -> policy -> execute -> capture verify -> RECOVERED",
      email: LOYAL_DEMO_EMAIL,
    },
    abandoned: {
      amountInr: 999,
      failureReason: "checkout abandoned by customer",
      label: "Checkout abandoned → payment link",
    },
  };

  const preset = presets[scenario] ?? presets.recoverable;
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
          ...(preset.email
            ? { email: preset.email, contact: "+919876543210" }
            : {}),
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
    message: `Demo scenario "${scenario}": ${preset.label}`,
    metadata: { scenario, amountInr: preset.amountInr, webhookEventId: stored.id },
  });

  await startRecoveryWorkflow({
    webhookEventId: stored.id,
    payload: failPayload,
  });

  await prisma.webhookEvent.update({
    where: { id: stored.id },
    data: { processed: true, processedAt: new Date() },
  });

  let recoveryCase = await prisma.recoveryCase.findFirst({
    where: { payment: { razorpayPaymentId: paymentId } },
    orderBy: { createdAt: "desc" },
    include: {
      decisions: true,
      actions: true,
      audits: { orderBy: { createdAt: "asc" } },
      results: true,
    },
  });

  // Close the money loop: real payment.captured only if Razorpay execution succeeded
  if (scenario === "full_recovery" && recoveryCase) {
    const afterExec = await prisma.recoveryCase.findUnique({
      where: { id: recoveryCase.id },
      include: { actions: true },
    });
    const executionOk =
      afterExec?.status === "WAITING_FOR_WEBHOOK" ||
      (afterExec?.actions ?? []).some(
        (a) =>
          a.policyDecision === "APPROVED" &&
          (a.status === "executed" || a.status === "succeeded") &&
          !!a.razorpayRefId
      );

    if (executionOk) {
      const capturePayload = {
        event: "payment.captured",
        id: `evt_demo_capture_${suffix}`,
        payload: {
          payment: {
            entity: {
              id: `pay_demo_capture_${suffix}`,
              amount: amountPaise,
              currency: "INR",
              status: "captured",
              method: "card",
              notes: {
                recovery_case_id: recoveryCase.id,
                source: "razorrecover_demo",
              },
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

      await startRecoveryWorkflow({
        webhookEventId: captureEvent.id,
        payload: capturePayload,
      });

      await prisma.webhookEvent.update({
        where: { id: captureEvent.id },
        data: { processed: true, processedAt: new Date() },
      });

      recoveryCase = await prisma.recoveryCase.findUnique({
        where: { id: recoveryCase.id },
        include: {
          decisions: true,
          actions: true,
          audits: { orderBy: { createdAt: "asc" } },
          results: true,
        },
      });
    } else {
      await writeAudit({
        recoveryCaseId: recoveryCase.id,
        eventType: "demo.capture_fallback",
        message:
          "Razorpay execution did not succeed — closing full_recovery demo via simulate payment.captured",
        metadata: { priorStatus: afterExec?.status ?? null },
      });
      recoveryCase = await applySimulatedCapture(
        recoveryCase.id,
        `Simulated payment.captured (full_recovery fallback — Razorpay link failed; prior status ${afterExec?.status ?? "unknown"})`
      );
    }
  }

  return res.json({
    ok: true,
    scenario,
    label: preset.label,
    amountInr: preset.amountInr,
    case: recoveryCase,
  });
  })
);

/**
 * Re-run Razorpay execution for a queued / failed case (useful for Day-1 queued rows).
 */
recoveryRouter.post(
  "/cases/:id/execute",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const recoveryCase = await prisma.recoveryCase.findUnique({
      where: { id },
  });

  if (!recoveryCase) {
    return res.status(404).json({ error: "Not found" });
  }

  if (recoveryCase.status === "RECOVERED") {
    return res.status(400).json({ error: "Case already recovered" });
  }

  if (recoveryCase.status === "ESCALATED" || recoveryCase.status === "REJECTED") {
    return res.status(400).json({
      error: `Cannot execute — case is ${recoveryCase.status} (policy gate)`,
    });
  }

  const actionRaw =
    recoveryCase.recommendedAction &&
    recoveryCase.recommendedAction !== "STOP" &&
    recoveryCase.recommendedAction !== "HUMAN_ESCALATION"
      ? recoveryCase.recommendedAction
      : "PAYMENT_LINK";
  const action = actionRaw === "REMINDER" || actionRaw === "WAIT" ? "PAYMENT_LINK" : actionRaw;

  const execution = await executeRecoveryAction({
    recoveryCaseId: recoveryCase.id,
    action,
    amountPaise: recoveryCase.amount,
    currency: recoveryCase.currency,
  });

  const saved = await prisma.recoveryAction.create({
    data: {
      recoveryCaseId: recoveryCase.id,
      actionType: action,
      policyDecision: "APPROVED",
      status: execution.status,
      razorpayRefId: execution.razorpayRefId,
      metadata: {
        message: execution.message,
        shortUrl: execution.shortUrl,
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
      },
    });
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: "recovery.executed",
      message: execution.message,
      metadata: {
        razorpayRefId: execution.razorpayRefId,
        shortUrl: execution.shortUrl,
      },
    });
  } else {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "FAILED" },
    });
  }

  return res.json({ ok: execution.ok, action: saved, execution });
  })
);

/**
 * Dev helper: mark a waiting case recovered (simulates payment.captured).
 * Use when you can't complete a real Test Mode payment.
 */
recoveryRouter.post(
  "/cases/:id/simulate-capture",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const recoveryCase = await prisma.recoveryCase.findUnique({
      where: { id },
    });

    if (!recoveryCase) {
      return res.status(404).json({ error: "Not found" });
    }

    if (recoveryCase.status === "RECOVERED") {
      return res.json({ ok: true, recoveredAmount: recoveryCase.recoveredAmount / 100 });
    }

    await applySimulatedCapture(id, `Simulated recovery of ₹${recoveryCase.amount / 100}`);
    return res.json({ ok: true, recoveredAmount: recoveryCase.amount / 100 });
  })
);

/** Record a customer promise-to-pay date */
recoveryRouter.post(
  "/cases/:id/promise",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const dateRaw = String(req.body?.promiseToPayAt ?? "").trim();
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : undefined;
    const setBy = typeof req.body?.setBy === "string" ? req.body.setBy.trim() : undefined;
    if (!dateRaw) return res.status(400).json({ error: "promiseToPayAt is required (ISO date)" });
    const promiseToPayAt = new Date(dateRaw);
    if (Number.isNaN(promiseToPayAt.getTime())) {
      return res.status(400).json({ error: "Invalid promiseToPayAt" });
    }
    const result = await setPromiseToPay({ caseId: id, promiseToPayAt, note, setBy });
    if ((result as { error?: string }).error) {
      return res.status(400).json(result);
    }
    const updated = await prisma.recoveryCase.findUnique({
      where: { id },
      include: caseInclude,
    });
    return res.json({ ...result, case: updated });
  })
);

/** List cases with due sequencer actions */
recoveryRouter.get(
  "/scheduler/due",
  asyncHandler(async (_req, res) => {
    const due = await listDueActions(50);
    return res.json({ count: due.length, due });
  })
);

/**
 * Process due PTP / mandate / B2B actions.
 * body.forceCaseId — run one case even if nextActionAt is in the future (demo tick)
 */
recoveryRouter.post(
  "/scheduler/tick",
  asyncHandler(async (req, res) => {
    const forceCaseId =
      typeof req.body?.forceCaseId === "string" ? req.body.forceCaseId.trim() : undefined;
    const result = await processDueActions({ forceCaseId, limit: 20 });
    return res.json({ ok: true, ...result });
  })
);

recoveryRouter.get(
  "/reviewers",
  asyncHandler(async (_req, res) => {
    res.json({ reviewers: DEMO_REVIEWERS });
  })
);

recoveryRouter.post(
  "/cases/:id/assign",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const mode = String(req.body?.mode ?? "").toUpperCase();
    const assignedTo = String(req.body?.assignedTo ?? "").trim();
    const assignedToRole = String(req.body?.assignedToRole ?? "").trim() || null;

    if (mode !== "SELF" && mode !== "MANUAL") {
      return res.status(400).json({ error: "mode must be SELF or MANUAL" });
    }
    if (!assignedTo) {
      return res.status(400).json({ error: "assignedTo is required" });
    }

    const recoveryCase = await prisma.recoveryCase.findUnique({ where: { id } });
    if (!recoveryCase) return res.status(404).json({ error: "Not found" });
    if (recoveryCase.status !== "ESCALATED") {
      return res.status(400).json({ error: "Only escalated cases can be assigned" });
    }

    await prisma.recoveryCase.update({
      where: { id },
      data: {
        assignedTo,
        assignedToRole,
        assignedAt: new Date(),
        assignmentMode: mode,
      },
    });

    await writeAudit({
      recoveryCaseId: id,
      eventType: "review.assigned",
      message:
        mode === "SELF"
          ? `Merchant self-assigned review to ${assignedTo}`
          : `Manually assigned to ${assignedTo}${assignedToRole ? ` (${assignedToRole})` : ""}`,
      metadata: { mode, assignedTo, assignedToRole },
    });

    const updated = await prisma.recoveryCase.findUnique({
      where: { id },
      include: caseInclude,
    });
    return res.json({ ok: true, case: updated });
  })
);

recoveryRouter.post(
  "/cases/:id/review",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const action = String(req.body?.action ?? "").toLowerCase();
    const notes = String(req.body?.notes ?? "").trim();
    const reviewedBy = String(req.body?.reviewedBy ?? "").trim() || "Merchant";

    if (!["approve", "reject", "request_info"].includes(action)) {
      return res.status(400).json({ error: "action must be approve, reject, or request_info" });
    }

    const recoveryCase = await prisma.recoveryCase.findUnique({
      where: { id },
      include: { customer: true, payment: true },
    });
    if (!recoveryCase) return res.status(404).json({ error: "Not found" });
    if (recoveryCase.status !== "ESCALATED") {
      return res.status(400).json({ error: "Only escalated cases can be reviewed" });
    }
    if (!recoveryCase.assignedTo) {
      return res.status(400).json({ error: "Assign a reviewer before taking review actions" });
    }

    if (action === "request_info") {
      if (!notes) {
        return res.status(400).json({ error: "Notes are required when requesting more info" });
      }
      await prisma.recoveryCase.update({
        where: { id },
        data: { reviewNotes: notes },
      });
      await writeAudit({
        recoveryCaseId: id,
        eventType: "review.info_requested",
        message: `${reviewedBy} requested more info: ${notes}`,
        metadata: { reviewedBy, notes },
      });
      const updated = await prisma.recoveryCase.findUnique({
        where: { id },
        include: caseInclude,
      });
      return res.json({ ok: true, action, case: updated });
    }

    if (action === "reject") {
      await prisma.recoveryCase.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewNotes: notes || recoveryCase.reviewNotes,
        },
      });
      await prisma.recoveryAction.create({
        data: {
          recoveryCaseId: id,
          actionType: "STOP",
          policyDecision: "REJECTED",
          status: "human_rejected",
          metadata: { reviewedBy, notes },
        },
      });
      await writeAudit({
        recoveryCaseId: id,
        eventType: "review.rejected",
        message: `${reviewedBy} rejected recovery${notes ? `: ${notes}` : ""}`,
        metadata: { reviewedBy, notes },
      });
      const updated = await prisma.recoveryCase.findUnique({
        where: { id },
        include: caseInclude,
      });
      return res.json({ ok: true, action, case: updated });
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
          ...(execution.metadata ?? {}),
        },
      },
    });

    if (execution.ok) {
      await prisma.recoveryCase.update({
        where: { id },
        data: {
          status: "WAITING_FOR_WEBHOOK",
          attemptCount: { increment: 1 },
          reviewNotes: notes || recoveryCase.reviewNotes,
        },
      });
      await writeAudit({
        recoveryCaseId: id,
        eventType: "review.approved",
        message: `${reviewedBy} approved human override and executed ${execAction}${notes ? `: ${notes}` : ""}`,
        metadata: {
          reviewedBy,
          notes,
          execAction,
          razorpayRefId: execution.razorpayRefId,
          shortUrl: execution.shortUrl,
        },
      });
      await writeAudit({
        recoveryCaseId: id,
        eventType: "recovery.executed",
        message: execution.message,
        metadata: {
          razorpayRefId: execution.razorpayRefId,
          shortUrl: execution.shortUrl,
        },
      });
    } else {
      await prisma.recoveryCase.update({
        where: { id },
        data: { status: "FAILED", reviewNotes: notes || recoveryCase.reviewNotes },
      });
      await writeAudit({
        recoveryCaseId: id,
        eventType: "recovery.execution_failed",
        message: execution.message,
        metadata: { reviewedBy },
      });
    }

    const updated = await prisma.recoveryCase.findUnique({
      where: { id },
      include: caseInclude,
    });
    return res.json({ ok: execution.ok, action, execution, case: updated });
  })
);

recoveryRouter.get(
  "/audit",
  asyncHandler(async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(logs);
  })
);
