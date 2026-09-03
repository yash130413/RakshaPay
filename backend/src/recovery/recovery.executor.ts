import type { RecoveryActionType } from "@prisma/client";
import { prisma } from "../db.js";
import { writeAudit } from "../audit/audit.service.js";
import { RazorpayService } from "../razorpay/razorpay.service.js";

export type ExecuteResult = {
  ok: boolean;
  razorpayRefId?: string;
  shortUrl?: string;
  status: string;
  message: string;
  metadata?: Record<string, unknown>;
};

/**
 * Executes a policy-approved recovery action via Razorpay Test APIs.
 * AI recommends; policy gates; this module is the only place that talks to Razorpay for actions.
 */
export async function executeRecoveryAction(params: {
  recoveryCaseId: string;
  action: RecoveryActionType;
  amountPaise: number;
  currency?: string;
  customer?: { name?: string; email?: string; contact?: string };
}): Promise<ExecuteResult> {
  const { recoveryCaseId, action, amountPaise, currency, customer } = params;

  await prisma.recoveryCase.update({
    where: { id: recoveryCaseId },
    data: { status: "EXECUTING" },
  });

  try {
    if (
      action === "PAYMENT_LINK" ||
      action === "RETRY_PAYMENT" ||
      action === "METHOD_UPDATE"
    ) {
      const description =
        action === "METHOD_UPDATE"
          ? `RakshaPay: update payment method & pay (case ${recoveryCaseId})`
          : action === "RETRY_PAYMENT"
            ? `RakshaPay: retry via recovery payment link (case ${recoveryCaseId})`
            : `RakshaPay: recovery payment link (case ${recoveryCaseId})`;

      const link = await RazorpayService.createPaymentLink({
        amount: amountPaise,
        currency: currency ?? "INR",
        description,
        customer,
        notes: {
          recovery_case_id: recoveryCaseId,
          recovery_action: action,
          source: "rakshapay",
        },
        referenceId: `rp_${recoveryCaseId.slice(-12)}`,
      });

      const linkId = String(link.id ?? "");
      const shortUrl = link.short_url ? String(link.short_url) : undefined;

      return {
        ok: true,
        razorpayRefId: linkId,
        shortUrl,
        status: "executed",
        message:
          action === "RETRY_PAYMENT"
            ? `Retry path: Razorpay recovery payment link ${linkId}${shortUrl ? `: ${shortUrl}` : ""}`
            : action === "METHOD_UPDATE"
              ? `Method update path: payment link ${linkId}${shortUrl ? `: ${shortUrl}` : ""}`
              : `Created Razorpay payment link ${linkId}${shortUrl ? `: ${shortUrl}` : ""}`,
        metadata: {
          paymentLinkId: linkId,
          shortUrl,
          action,
          executionMode: "razorpay_payment_link",
        },
      };
    }

    if (action === "WAIT") {
      return {
        ok: true,
        status: "waiting",
        message: "WAIT action — no Razorpay call; waiting for customer retry",
      };
    }

    return {
      ok: false,
      status: "skipped",
      message: `Action ${action} is not auto-executable`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Razorpay error";
    await writeAudit({
      recoveryCaseId,
      eventType: "recovery.execution_failed",
      message,
      metadata: { action, error: message },
    });
    return {
      ok: false,
      status: "failed",
      message,
    };
  }
}
