import type { RecoveryCase } from "./types";
import { agentSource } from "./format";

export type AgentMix = {
  gemini: number;
  rules: number;
  pending: number;
  total: number;
  geminiPct: number;
  rulesPct: number;
};

export function computeAgentMix(cases: RecoveryCase[]): AgentMix {
  let gemini = 0;
  let rules = 0;
  let pending = 0;

  for (const c of cases) {
    const source = agentSource(c.decisions);
    if (source === "gemini") gemini += 1;
    else if (source === "rules") rules += 1;
    else pending += 1;
  }

  const total = cases.length;
  const decided = gemini + rules;

  return {
    gemini,
    rules,
    pending,
    total,
    geminiPct: decided > 0 ? Math.round((gemini / decided) * 100) : 0,
    rulesPct: decided > 0 ? Math.round((rules / decided) * 100) : 0,
  };
}

/** Default merchant policy — mirrors backend workflow seed values */
export const DEMO_POLICY_LIMITS = {
  maxRetries: 2,
  maxRecoveryInr: 50_000,
  humanReviewAboveInr: 25_000,
  paymentLinks: true,
} as const;
