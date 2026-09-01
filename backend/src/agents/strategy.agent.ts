import { z } from "zod";
import { generateStructuredJson } from "./llm.client.js";
import { chooseRecoveryStrategyRules, RECOVERY_ACTIONS } from "./rules.js";
import type { StrategyResult } from "./types.js";

const StrategySchema = z.object({
  recommendedAction: z.enum(RECOVERY_ACTIONS),
  reason: z.string().min(1),
  expectedRecoveryProbability: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `You are a revenue recovery strategy agent for Indian merchants using Razorpay.
Given a diagnosis and payment context, recommend ONE recovery action.
Return ONLY valid JSON:
{
  "recommendedAction": "RETRY_PAYMENT|PAYMENT_LINK|METHOD_UPDATE|WAIT|HUMAN_ESCALATION|STOP",
  "reason": "one sentence why",
  "expectedRecoveryProbability": 0.0-1.0
}

Guidelines:
- RETRY_PAYMENT for temporary failures when previousAttempts < 2, especially if successfulPayments >= 3
- PAYMENT_LINK for checkout_abandoned or moderate amounts
- METHOD_UPDATE when card/UPI method must change (expired/international)
- HUMAN_ESCALATION for high amounts (>25000 INR) or exhausted retries
- STOP when recovery is unlikely
You only recommend — you never execute payments.`;

export async function chooseRecoveryStrategy(input: {
  diagnosis: string;
  amount: number;
  previousAttempts: number;
  successfulPayments: number;
  isLoyalCustomer?: boolean;
  failureCategory?: string;
}): Promise<StrategyResult> {
  const llm = await generateStructuredJson({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: JSON.stringify(
      {
        diagnosis: input.diagnosis,
        failureCategory: input.failureCategory,
        amountInr: input.amount,
        previousAttempts: input.previousAttempts,
        successfulPayments: input.successfulPayments,
        isLoyalCustomer: input.isLoyalCustomer ?? input.successfulPayments >= 3,
      },
      null,
      2
    ),
    schema: StrategySchema,
  });

  if (llm) {
    return {
      recommendedAction: llm.data.recommendedAction,
      reason: llm.data.reason,
      expectedRecoveryProbability: llm.data.expectedRecoveryProbability,
      source: "gemini",
      model: llm.model,
    };
  }

  return chooseRecoveryStrategyRules(input);
}
