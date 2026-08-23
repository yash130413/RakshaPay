import { z } from "zod";
import { generateStructuredJson } from "./llm.client.js";
import { diagnoseFailureRules } from "./rules.js";
import type { DiagnosisResult } from "./types.js";

const DiagnosisSchema = z.object({
  diagnosis: z.string().min(1),
  confidence: z.number().min(0).max(1),
  failureCategory: z.string().min(1),
  reason: z.string().min(1),
});

const SYSTEM_PROMPT = `You are a payment recovery diagnosis agent for Indian merchants using Razorpay.
Analyze why a payment failed and return ONLY valid JSON matching this schema:
{
  "diagnosis": "short_snake_case_label",
  "confidence": 0.0-1.0,
  "failureCategory": "category_snake_case",
  "reason": "one sentence explanation"
}

Use diagnosis labels like: temporary_payment_failure, expired_payment_method, international_card_blocked, insufficient_funds, authentication_failed, generic_payment_failure.
Do not recommend actions. Do not mention executing payments.`;

export async function diagnoseFailure(input: {
  failureReason?: string | null;
  method?: string | null;
  previousAttempts?: number;
  amountInr?: number;
}): Promise<DiagnosisResult> {
  const llm = await generateStructuredJson({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: JSON.stringify(
      {
        failureReason: input.failureReason ?? "unknown",
        paymentMethod: input.method ?? "unknown",
        previousAttempts: input.previousAttempts ?? 0,
        amountInr: input.amountInr,
      },
      null,
      2
    ),
    schema: DiagnosisSchema,
  });

  if (llm) {
    return {
      diagnosis: llm.data.diagnosis,
      confidence: llm.data.confidence,
      failureCategory: llm.data.failureCategory,
      reason: llm.data.reason,
      source: "gemini",
      model: llm.model,
    };
  }

  return diagnoseFailureRules({ failureReason: input.failureReason });
}
