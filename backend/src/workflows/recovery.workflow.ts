import { prisma } from "../db.js";
import { writeAudit } from "../audit/audit.service.js";
import {
  chooseRecoveryStrategy,
  detectRevenueRisk,
  diagnoseFailure,
  verifyRecovery,
} from "../agents/index.js";
import {
  recordCustomerRecovery,
  resolveCustomerContext,
} from "../customers/customer.context.js";
import { evaluatePolicy } from "../policy/policy.engine.js";
import { executeRecoveryAction } from "../recovery/recovery.executor.js";
import type { RecoveryCase, RecoveryCaseStatus } from "@prisma/client";

/** Terminal statuses — only these get a brand-new case on a later failure. */
const CLOSED_CASE_STATUSES: RecoveryCaseStatus[] = ["RECOVERED", "REJECTED"];

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
 *
 * Re-fails for the same customer/open case stay on that case (re-diagnose + optional new link).
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

  const defaultEmail = process.env.MERCHANT_EMAIL || "demo@rakshapay.com";
  const defaultName = process.env.MERCHANT_NAME || "Demo Merchant";

  const merchant = await prisma.merchant.upsert({
    where: { email: defaultEmail },
    update: {},
    create: {
      name: defaultName,
      email: defaultEmail,
      policies: {
        create: {
          name: "default",
          maxRetries: 2,
          maxRecoveryAmount: 50000,
          allowPaymentLink: true,
          requireHumanAbove: 25000,
          notifyCustomerSms: true,
          notifyCustomerEmail: true,
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

  const customerCtx = await resolveCustomerContext({
    merchantId: merchant.id,
    email: paymentEntity?.email,
    contact: paymentEntity?.contact,
  });

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
        customerId: customerCtx?.customerId,
        razorpayPaymentId: paymentEntity.id,
        amount,
        currency: paymentEntity.currency ?? "INR",
        status: paymentEntity.status ?? "failed",
        method: paymentEntity.method,
        failureReason,
      },
    });
  } else if (payment) {
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: paymentEntity?.status ?? payment.status,
        failureReason: failureReason ?? payment.failureReason,
        ...(customerCtx && !payment.customerId
          ? { customerId: customerCtx.customerId }
          : {}),
      },
    });
  }

  const resolved = await resolveRecoveryCaseForFailure({
    merchantId: merchant.id,
    customerId: customerCtx?.customerId ?? null,
    paymentId: payment?.id ?? null,
    amount,
    currency: paymentEntity?.currency ?? "INR",
    failureReason,
    noteCaseId: paymentEntity?.notes?.recovery_case_id ?? null,
  });

  if (resolved.skipWorkflow) {
    await writeAudit({
      recoveryCaseId: resolved.recoveryCase.id,
      eventType: "payment.failed.duplicate",
      message: `Ignored duplicate payment.failed for ₹${amount / 100} — already handled on this case`,
      metadata: {
        razorpayPaymentId: paymentEntity?.id,
        caseStatus: resolved.recoveryCase.status,
      },
    });
    return;
  }

  const recoveryCase = resolved.recoveryCase;

  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: resolved.reused ? "payment.failed.reattempt" : "payment.failed",
    message: resolved.reused
      ? `Re-attempt failed for ₹${amount / 100} — continuing on existing case`
      : `Payment failed for ₹${amount / 100}`,
    metadata: {
      razorpayPaymentId: paymentEntity?.id,
      reusedCase: resolved.reused,
      customerHistory: customerCtx
        ? {
            successfulPayments: customerCtx.successfulPayments,
            isLoyalCustomer: customerCtx.isLoyalCustomer,
          }
        : null,
    },
  });

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: { status: "ANALYZING" },
  });

  const risk = await detectRevenueRisk({
    eventType,
    amount,
    status: paymentEntity?.status,
  });
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

  const attemptCount = await prisma.recoveryAction.count({
    where: { recoveryCaseId: recoveryCase.id },
  });

  const diagnosis = await diagnoseFailure({
    failureReason,
    method: paymentEntity?.method,
    previousAttempts: attemptCount,
    amountInr: amount / 100,
    successfulPayments: customerCtx?.successfulPayments ?? 0,
    avgAmountInr: customerCtx?.avgAmountInr ?? 0,
    isLoyalCustomer: customerCtx?.isLoyalCustomer ?? false,
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
      agent: diagnosis.source === "gemini" ? "diagnosis_gemini" : "diagnosis_rules",
      diagnosis: diagnosis.diagnosis,
      confidence: diagnosis.confidence,
      reason: diagnosis.reason ?? diagnosis.failureCategory,
      rawJson: diagnosis,
    },
  });

  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "diagnosis.completed",
    message: diagnosis.diagnosis,
    metadata: diagnosis,
  });

  const strategy = await chooseRecoveryStrategy({
    diagnosis: diagnosis.diagnosis,
    amount: amount / 100,
    previousAttempts: attemptCount,
    successfulPayments: customerCtx?.successfulPayments ?? 0,
    isLoyalCustomer: customerCtx?.isLoyalCustomer ?? false,
    failureCategory: diagnosis.failureCategory,
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
      agent: strategy.source === "gemini" ? "strategy_gemini" : "strategy_rules",
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

/**
 * Prefer an existing open case for this failure instead of spawning duplicates.
 * Order: notes.recovery_case_id → same payment → open customer+amount case → create.
 */
async function resolveRecoveryCaseForFailure(params: {
  merchantId: string;
  customerId: string | null;
  paymentId: string | null;
  amount: number;
  currency: string;
  failureReason: string | null;
  noteCaseId: string | null;
}): Promise<{ recoveryCase: RecoveryCase; reused: boolean; skipWorkflow: boolean }> {
  const { merchantId, customerId, paymentId, amount, currency, failureReason, noteCaseId } =
    params;

  const reopenFields = {
    paymentId: paymentId ?? undefined,
    amount,
    currency,
    failureReason,
    status: "RECEIVED" as const,
    diagnosis: null,
    diagnosisConfidence: null,
    recommendedAction: null,
    expectedRecoveryProbability: null,
  };

  if (noteCaseId) {
    const fromNotes = await prisma.recoveryCase.findUnique({ where: { id: noteCaseId } });
    if (fromNotes && fromNotes.merchantId === merchantId) {
      if (CLOSED_CASE_STATUSES.includes(fromNotes.status)) {
        // Fall through — closed case should not absorb new failures
      } else if (
        paymentId &&
        fromNotes.paymentId === paymentId &&
        fromNotes.status !== "RECEIVED"
      ) {
        return { recoveryCase: fromNotes, reused: true, skipWorkflow: true };
      } else {
        const updated = await prisma.recoveryCase.update({
          where: { id: fromNotes.id },
          data: reopenFields,
        });
        return { recoveryCase: updated, reused: true, skipWorkflow: false };
      }
    }
  }

  if (paymentId) {
    const byPayment = await prisma.recoveryCase.findFirst({
      where: { merchantId, paymentId },
      orderBy: { createdAt: "desc" },
    });
    if (byPayment) {
      if (CLOSED_CASE_STATUSES.includes(byPayment.status)) {
        return { recoveryCase: byPayment, reused: true, skipWorkflow: true };
      }
      if (byPayment.status !== "RECEIVED") {
        // Same Razorpay payment already drove a full recovery pass
        return { recoveryCase: byPayment, reused: true, skipWorkflow: true };
      }
      const updated = await prisma.recoveryCase.update({
        where: { id: byPayment.id },
        data: reopenFields,
      });
      return { recoveryCase: updated, reused: true, skipWorkflow: false };
    }
  }

  if (customerId) {
    const openCase = await prisma.recoveryCase.findFirst({
      where: {
        merchantId,
        customerId,
        amount,
        status: { notIn: CLOSED_CASE_STATUSES },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (openCase) {
      const updated = await prisma.recoveryCase.update({
        where: { id: openCase.id },
        data: reopenFields,
      });
      return { recoveryCase: updated, reused: true, skipWorkflow: false };
    }
  }

  const created = await prisma.recoveryCase.create({
    data: {
      merchantId,
      customerId: customerId ?? undefined,
      paymentId: paymentId ?? undefined,
      amount,
      currency,
      status: "RECEIVED",
      failureReason,
    },
  });
  return { recoveryCase: created, reused: false, skipWorkflow: false };
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

  const verification = await verifyRecovery({
    eventType: "payment.captured",
    amount,
    expectedAmountPaise: recoveryCase?.amount,
    recoveryCaseId: recoveryCase?.id,
    noteCaseId: caseIdFromNotes,
  });

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
        verification,
      },
    });
    return;
  }

  if (!verification.success) {
    await writeAudit({
      recoveryCaseId: recoveryCase.id,
      eventType: "recovery.verification_failed",
      message: verification.notes,
      metadata: { verification, amount, expectedAmountPaise: recoveryCase.amount },
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

  if (recoveryCase.customerId) {
    await recordCustomerRecovery({
      customerId: recoveryCase.customerId,
      recoveredAmountPaise: amount,
    });
  }

  await writeAudit({
    recoveryCaseId: recoveryCase.id,
    eventType: "recovery.confirmed",
    message: `Recovered ₹${amount / 100} via payment.captured (${verification.notes})`,
    metadata: {
      webhookEventId,
      recoveredAmount: amount,
      razorpayPaymentId: paymentEntity?.id,
      verification,
    },
  });
}
