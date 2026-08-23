import { prisma } from "../db.js";
import { writeAudit } from "../audit/audit.service.js";
import {
  chooseRecoveryStrategy,
  detectRevenueRisk,
  diagnoseFailure,
  verifyRecovery,
} from "../agents/index.js";
import { evaluatePolicy } from "../policy/policy.engine.js";
import { executeRecoveryAction } from "../recovery/recovery.executor.js";

type WebhookPayload = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        method?: string;
        error_reason?: string;
        error_description?: string;
        notes?: Record<string, string>;
        email?: string;
        contact?: string;
      };
    };
  };
};

/**
 * Bounded state machine:
 * RECEIVED → ANALYZING → DIAGNOSED → ACTION_SELECTED → POLICY_CHECK
 * → APPROVED|REJECTED|ESCALATED → EXECUTING → WAITING_FOR_WEBHOOK
 * → RECOVERED|FAILED
 */
export async function startRecoveryWorkflow(params: {
  webhookEventId: string;
  payload: WebhookPayload;
}) {
  const eventType = params.payload.event ?? "unknown";
  const paymentEntity = params.payload.payload?.payment?.entity;
  const amount = paymentEntity?.amount ?? 0;
  const failureReason =
    paymentEntity?.error_reason ?? paymentEntity?.error_description ?? null;

  const merchant = await prisma.merchant.upsert({
    where: { email: "demo@razorrecover.local" },
    update: {},
    create: {
      name: "Demo Merchant",
      email: "demo@razorrecover.local",
      policies: {
        create: {
          name: "default",
          maxRetries: 2,
          maxRecoveryAmount: 50000,
          allowPaymentLink: true,
          requireHumanAbove: 25000,
        },
      },
    },
    include: { policies: { where: { active: true }, take: 1 } },
  });

  const policy = merchant.policies[0] ?? {
    maxRetries: 2,
    maxRecoveryAmount: 50000,
    allowPaymentLink: true,
    requireHumanAbove: 25000,
  };

  if (eventType === "payment.captured") {
    await handlePaymentCaptured({
      webhookEventId: params.webhookEventId,
      paymentEntity,
      amount,
      merchantId: merchant.id,
    });
    return;
  }

  let payment =
    paymentEntity?.id
      ? await prisma.payment.findUnique({
          where: { razorpayPaymentId: paymentEntity.id },
        })
      : null;

  if (!payment && paymentEntity?.id) {
    payment = await prisma.payment.create({
      data: {
        merchantId: merchant.id,
        razorpayPaymentId: paymentEntity.id,
        amount,
        currency: paymentEntity.currency ?? "INR",
        status: paymentEntity.status ?? "failed",
        method: paymentEntity.method,
        failureReason,
      },
    });
  }

  const recoveryCase = await prisma.recoveryCase.create({
    data: {
      merchantId: merchant.id,
      paymentId: payment?.id,
      amount,
      currency: paymentEntity?.currency ?? "INR",
      status: "RECEIVED",
      failureReason,
    },
  });

  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "payment.failed",
    message: `Payment failed for ₹${amount / 100}`,
    metadata: { razorpayPaymentId: paymentEntity?.id },
  });

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: { status: "ANALYZING" },
  });

  const risk = await detectRevenueRisk({ eventType, amount });
  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "risk.detected",
    message: risk.reason,
    metadata: risk,
  });

  if (!risk.isRevenueAtRisk) {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "FAILED" },
    });
    return;
  }

  const diagnosis = await diagnoseFailure({
    failureReason,
    method: paymentEntity?.method,
  });

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      status: "DIAGNOSED",
      diagnosis: diagnosis.diagnosis,
      diagnosisConfidence: diagnosis.confidence,
    },
  });

  await prisma.aIDecision.create({
    data: {
      recoveryCaseId: recoveryCase.id,
      agent: "diagnosis",
      diagnosis: diagnosis.diagnosis,
      confidence: diagnosis.confidence,
      reason: diagnosis.failureCategory,
      rawJson: diagnosis,
    },
  });

  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "diagnosis.completed",
    message: diagnosis.diagnosis,
    metadata: diagnosis,
  });

  const attemptCount = await prisma.recoveryAction.count({
    where: { recoveryCaseId: recoveryCase.id },
  });

  const strategy = await chooseRecoveryStrategy({
    diagnosis: diagnosis.diagnosis,
    amount: amount / 100,
    previousAttempts: attemptCount,
    successfulPayments: 0,
  });

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      status: "ACTION_SELECTED",
      recommendedAction: strategy.recommendedAction,
      expectedRecoveryProbability: strategy.expectedRecoveryProbability,
    },
  });

  await prisma.aIDecision.create({
    data: {
      recoveryCaseId: recoveryCase.id,
      agent: "strategy",
      recommendedAction: strategy.recommendedAction,
      reason: strategy.reason,
      confidence: strategy.expectedRecoveryProbability,
      rawJson: strategy,
    },
  });

  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "recovery.recommended",
    message: strategy.reason,
    metadata: strategy,
  });

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: { status: "POLICY_CHECK" },
  });

  const policyResult = evaluatePolicy({
    action: strategy.recommendedAction,
    amount: amount / 100,
    attemptCount,
    policy,
  });

  if (policyResult.decision === "APPROVED") {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "APPROVED" },
    });
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: "policy.approved",
      message: policyResult.reasons.join("; "),
      metadata: policyResult,
    });

    const execution = await executeRecoveryAction({
      recoveryCaseId: recoveryCase.id,
      action: strategy.recommendedAction,
      amountPaise: amount,
      currency: paymentEntity?.currency ?? "INR",
      customer: {
        email: paymentEntity?.email,
        contact: paymentEntity?.contact,
      },
    });

    await prisma.recoveryAction.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        actionType: strategy.recommendedAction,
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
          attemptCount: attemptCount + 1,
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
        data: { status: "FAILED", attemptCount: attemptCount + 1 },
      });
      await writeAudit({
        recoveryCaseId: recoveryCase.id,
        eventType: "recovery.failed",
        message: execution.message,
      });
    }
  } else if (policyResult.decision === "ESCALATE") {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "ESCALATED" },
    });
    await prisma.recoveryAction.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        actionType: "HUMAN_ESCALATION",
        policyDecision: "ESCALATE",
        status: "needs_human",
      },
    });
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: "policy.escalated",
      message: policyResult.reasons.join("; "),
      metadata: policyResult,
    });
  } else {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "REJECTED" },
    });
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: "policy.rejected",
      message: policyResult.reasons.join("; "),
      metadata: policyResult,
    });
  }
}

type PaymentEntity = NonNullable<
  NonNullable<WebhookPayload["payload"]>["payment"]
>["entity"];

async function handlePaymentCaptured(params: {
  webhookEventId: string;
  paymentEntity?: PaymentEntity;
  amount: number;
  merchantId: string;
}) {
  const { paymentEntity, amount, webhookEventId, merchantId } = params;
  const notes = paymentEntity?.notes ?? {};
  const caseIdFromNotes = notes.recovery_case_id;

  const verification = await verifyRecovery({
    eventType: "payment.captured",
    amount,
  });

  let recoveryCase = caseIdFromNotes
    ? await prisma.recoveryCase.findUnique({ where: { id: caseIdFromNotes } })
    : null;

  if (!recoveryCase) {
    recoveryCase = await prisma.recoveryCase.findFirst({
      where: {
        merchantId,
        status: "WAITING_FOR_WEBHOOK",
        amount,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  if (!recoveryCase) {
    recoveryCase = await prisma.recoveryCase.findFirst({
      where: { merchantId, status: "WAITING_FOR_WEBHOOK" },
      orderBy: { createdAt: "asc" },
    });
  }

  if (paymentEntity?.id) {
    await prisma.payment.upsert({
      where: { razorpayPaymentId: paymentEntity.id },
      update: { status: "captured" },
      create: {
        merchantId,
        razorpayPaymentId: paymentEntity.id,
        amount,
        currency: paymentEntity.currency ?? "INR",
        status: "captured",
        method: paymentEntity.method,
      },
    });
  }

  if (!recoveryCase) {
    await writeAudit({
      eventType: "recovery.confirmed",
      message: `${verification.notes} (no open recovery case matched)`,
      metadata: {
        webhookEventId,
        recoveredAmount: verification.recoveredAmount,
        razorpayPaymentId: paymentEntity?.id,
      },
    });
    return;
  }

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      status: "RECOVERED",
      recoveredAmount: amount,
    },
  });

  await prisma.recoveryResult.create({
    data: {
      recoveryCaseId: recoveryCase.id,
      success: true,
      recoveredAmount: amount,
      sourceEventId: webhookEventId,
      notes: verification.notes,
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
    message: `Recovered ₹${amount / 100} via payment.captured`,
    metadata: {
      webhookEventId,
      recoveredAmount: amount,
      razorpayPaymentId: paymentEntity?.id,
    },
  });
}
