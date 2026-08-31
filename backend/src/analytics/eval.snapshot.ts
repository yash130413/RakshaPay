/**
 * Snapshot from evaluation/results/comparison.json (holdout, seed=42).
 * Served by GET /api/analytics/evaluation for the dashboard strip.
 */
export const EVAL_SNAPSHOT = {
  split: "holdout",
  n: 885,
  seed: 42,
  baseline: {
    recoveryRate: 0.4927,
    revenueRecovered: 3771646,
    retries: 2026,
    unnecessaryRetries: 1009,
  },
  razorrecover: {
    recoveryRate: 0.6859,
    revenueRecovered: 4503538,
    retries: 222,
    unnecessaryRetries: 0,
  },
  highlights: [
    { label: "Recovery rate", baseline: "49.3%", agent: "68.6%", delta: "+19.3 pp" },
    { label: "Revenue recovered", baseline: "Rs 37.7L", agent: "Rs 45.0L", delta: "+Rs 7.3L" },
    { label: "Retries", baseline: "2026", agent: "222", delta: "-1804" },
    { label: "Unnecessary retries", baseline: "1009", agent: "0", delta: "-1009" },
  ],
} as const;
