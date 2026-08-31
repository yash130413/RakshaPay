import { Router } from "express";
import { prisma } from "../db.js";
import { writeAudit } from "../audit/audit.service.js";
import { executeRecoveryAction } from "./recovery.executor.js";
import { startRecoveryWorkflow } from "../workflows/recovery.workflow.js";

export const recoveryRouter = Router();

recoveryRouter.get("/cases", async (_req, res) => {
  const cases = await prisma.recoveryCase.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      actions: true,
      decisions: { orderBy: { createdAt: "asc" } },
      audits: { orderBy: { createdAt: "asc" }, take: 30 },
    },
  });
  res.json(cases);
});

recoveryRouter.get("/cases/:id", async (req, res) => {
  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: req.params.id },
    include: {
      decisions: { orderBy: { createdAt: "asc" } },
      actions: true,
      results: true,
      audits: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!recoveryCase) {
    return res.status(404).json({ error: "Not found" });
  }

  return res.json(recoveryCase);
});

/**
 * Demo triggers — bypass Razorpay signature so judges can see policy paths live.
 * Scenarios:
 *  - recoverable:   ~₹2,499 → AI decide → policy approve → payment link
 *  - escalate:      ~₹30,000 → policy ESCALATE (human review threshold)
 *  - reject:        ~₹60,000 → policy REJECT (above max recovery amount)
 *  - full_recovery: recoverable + payment.captured verifier → RECOVERED
 */
recoveryRouter.post("/demo/trigger", async (req, res) => {
  const scenario = (req.body?.scenario as string) ?? "recoverable";

  const presets: Record<
    string,
    { amountInr: number; failureReason: string; label: string }
  > = {
    recoverable: {
      amountInr: 2499,
      failureReason: "insufficient funds",
      label: "Standard recovery path",
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

  // Close the money loop via the real payment.captured verifier path
  if (scenario === "full_recovery" && recoveryCase) {
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
  }

  return res.json({
    ok: true,
    scenario,
    label: preset.label,
    amountInr: preset.amountInr,
    case: recoveryCase,
  });
});

/**
 * Re-run Razorpay execution for a queued / failed case (useful for Day-1 queued rows).
 */
recoveryRouter.post("/cases/:id/execute", async (req, res) => {
  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: req.params.id },
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

  const action =
    recoveryCase.recommendedAction &&
    recoveryCase.recommendedAction !== "STOP" &&
    recoveryCase.recommendedAction !== "HUMAN_ESCALATION"
      ? recoveryCase.recommendedAction
      : "PAYMENT_LINK";

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
});

/**
 * Dev helper: mark a waiting case recovered (simulates payment.captured).
 * Use when you can't complete a real Test Mode payment.
 */
recoveryRouter.post("/cases/:id/simulate-capture", async (req, res) => {
  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: req.params.id },
  });

  if (!recoveryCase) {
    return res.status(404).json({ error: "Not found" });
  }

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      status: "RECOVERED",
      recoveredAmount: recoveryCase.amount,
    },
  });

  await prisma.recoveryResult.create({
    data: {
      recoveryCaseId: recoveryCase.id,
      success: true,
      recoveredAmount: recoveryCase.amount,
      notes: "Simulated payment.captured (dev)",
    },
  });

  await prisma.recoveryAction.updateMany({
    where: {
      recoveryCaseId: recoveryCase.id,
      status: { in: ["executed", "queued", "waiting"] },
    },
    data: { status: "succeeded" },
  });

  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "recovery.confirmed",
    message: `Simulated recovery of ₹${recoveryCase.amount / 100}`,
  });

  return res.json({ ok: true, recoveredAmount: recoveryCase.amount / 100 });
});

recoveryRouter.get("/audit", async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(logs);
});
