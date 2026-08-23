import { Router } from "express";
import { prisma } from "../db.js";
import { writeAudit } from "../audit/audit.service.js";
import { executeRecoveryAction } from "./recovery.executor.js";

export const recoveryRouter = Router();

recoveryRouter.get("/cases", async (_req, res) => {
  const cases = await prisma.recoveryCase.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      actions: true,
      audits: { orderBy: { createdAt: "asc" }, take: 20 },
    },
  });
  res.json(cases);
});

recoveryRouter.get("/cases/:id", async (req, res) => {
  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: req.params.id },
    include: {
      decisions: true,
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
