import type { Policy, RecoveryActionType } from "@prisma/client";

export type PolicyCheckInput = {
  action: RecoveryActionType;
  amount: number;
  attemptCount: number;
  policy: Pick<
    Policy,
    "maxRetries" | "maxRecoveryAmount" | "allowPaymentLink" | "requireHumanAbove"
  >;
};

export type PolicyCheckResult = {
  decision: "APPROVED" | "REJECTED" | "ESCALATE";
  reasons: string[];
};

/**
 * Authority layer — LLM cannot bypass this.
 */
export function evaluatePolicy(input: PolicyCheckInput): PolicyCheckResult {
  const reasons: string[] = [];

  if (input.amount > input.policy.maxRecoveryAmount) {
    reasons.push(
      `Amount ₹${input.amount} exceeds max recovery amount ₹${input.policy.maxRecoveryAmount}`
    );
    return { decision: "REJECTED", reasons };
  }

  if (input.amount > input.policy.requireHumanAbove) {
    reasons.push(
      `Amount ₹${input.amount} requires human review (threshold ₹${input.policy.requireHumanAbove})`
    );
    return { decision: "ESCALATE", reasons };
  }

  if (input.action === "RETRY_PAYMENT" && input.attemptCount >= input.policy.maxRetries) {
    reasons.push(
      `Max retries reached (${input.attemptCount}/${input.policy.maxRetries}) — stop rule`
    );
    return { decision: "ESCALATE", reasons };
  }

  if (input.action === "PAYMENT_LINK" && !input.policy.allowPaymentLink) {
    reasons.push("Payment links disabled by merchant policy");
    return { decision: "REJECTED", reasons };
  }

  if (input.action === "HUMAN_ESCALATION" || input.action === "STOP") {
    reasons.push("Action requires human / stop");
    return { decision: "ESCALATE", reasons };
  }

  reasons.push("Policy checks passed");
  return { decision: "APPROVED", reasons };
}
