"""
Evaluate Baseline (blind retry) vs RazorRecover (rules + policy mirrored from backend).

Uses held-out synthetic failures and a latent ground-truth recovery model.
Does NOT call Gemini/Razorpay — reproducible offline metrics for the internship report.

Usage:
  python generate_data.py
  python evaluate.py
  python evaluate.py --split holdout --seed 42
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
import random

from generate_data import true_recovery_prob

POLICY = {
    "max_retries": 2,
    "max_recovery_amount": 50000,
    "allow_payment_link": True,
    "require_human_above": 25000,
}


# ---------------------------------------------------------------------------
# Mirror of backend agents/rules.ts + policy.engine.ts
# ---------------------------------------------------------------------------

def diagnose(failure_reason: str) -> str:
    reason = (failure_reason or "").lower()
    if "insufficient" in reason:
        return "temporary_payment_failure"
    if "expired" in reason:
        return "expired_payment_method"
    if "international" in reason:
        return "international_card_blocked"
    return "generic_payment_failure"


def choose_action(diagnosis: str, amount: int, previous_attempts: int, history: int) -> str:
    if diagnosis in {"expired_payment_method", "international_card_blocked"}:
        return "PAYMENT_LINK"
    if diagnosis == "temporary_payment_failure" and previous_attempts < 2:
        return "RETRY_PAYMENT"
    if amount <= 15000:
        return "PAYMENT_LINK"
    return "HUMAN_ESCALATION"


def evaluate_policy(action: str, amount: int, attempt_count: int) -> str:
    if amount > POLICY["max_recovery_amount"]:
        return "REJECTED"
    if amount > POLICY["require_human_above"]:
        return "ESCALATE"
    if action == "RETRY_PAYMENT" and attempt_count >= POLICY["max_retries"]:
        return "ESCALATE"
    if action == "PAYMENT_LINK" and not POLICY["allow_payment_link"]:
        return "REJECTED"
    if action in {"HUMAN_ESCALATION", "STOP"}:
        return "ESCALATE"
    return "APPROVED"


def map_failure_type(row: dict) -> str:
    return row.get("failure_type") or "bank_decline"


@dataclass
class RunStats:
    name: str
    n: int = 0
    recovered: int = 0
    revenue_at_risk: float = 0.0
    revenue_recovered: float = 0.0
    retries: int = 0
    payment_links: int = 0
    escalations: int = 0
    rejects: int = 0
    unnecessary_retries: int = 0
    auto_actions: int = 0

    @property
    def recovery_rate(self) -> float:
        return self.recovered / self.n if self.n else 0.0

    @property
    def revenue_recovery_rate(self) -> float:
        return (
            self.revenue_recovered / self.revenue_at_risk if self.revenue_at_risk else 0.0
        )

    @property
    def escalation_rate(self) -> float:
        return self.escalations / self.n if self.n else 0.0

    @property
    def avg_retries(self) -> float:
        return self.retries / self.n if self.n else 0.0


def simulate_outcome(rng: random.Random, failure_type: str, action: str, amount: int, history: int) -> bool:
    p = true_recovery_prob(failure_type, action, amount, history)
    return rng.random() < p


def run_baseline(rows: list[dict], rng: random.Random) -> RunStats:
    """
    Blind merchant ops: always RETRY up to 3 times, ignore failure type / policy.
    Counts unnecessary retries when retrying expired/international cards.
    """
    stats = RunStats(name="baseline_blind_retry")
    for row in rows:
        amount = int(row["amount_inr"])
        history = int(row["successful_payments"])
        ftype = map_failure_type(row)
        stats.n += 1
        stats.revenue_at_risk += amount

        recovered = False
        for attempt in range(3):
            stats.retries += 1
            stats.auto_actions += 1
            if ftype in {"card_expired", "international_transaction_not_allowed"}:
                stats.unnecessary_retries += 1
            if simulate_outcome(rng, ftype, "RETRY_PAYMENT", amount, history):
                recovered = True
                break

        if recovered:
            stats.recovered += 1
            stats.revenue_recovered += amount

    return stats


def run_razorrecover(rows: list[dict], rng: random.Random) -> RunStats:
    """
    RazorRecover path: diagnose → strategy → policy → execute at most one approved action
    (with one optional second retry only when policy still allows RETRY_PAYMENT).
    """
    stats = RunStats(name="razorrecover_rules_policy")
    for row in rows:
        amount = int(row["amount_inr"])
        history = int(row["successful_payments"])
        ftype = map_failure_type(row)
        diagnosis = diagnose(row["failure_reason"])
        stats.n += 1
        stats.revenue_at_risk += amount

        attempts = 0
        recovered = False

        while attempts < 3 and not recovered:
            action = choose_action(diagnosis, amount, attempts, history)
            decision = evaluate_policy(action, amount, attempts)

            if decision == "REJECTED":
                stats.rejects += 1
                break

            if decision == "ESCALATE":
                stats.escalations += 1
                # Human path: one moderated recovery attempt
                stats.auto_actions += 1
                if simulate_outcome(rng, ftype, "HUMAN_ESCALATION", amount, history):
                    recovered = True
                break

            # APPROVED
            stats.auto_actions += 1
            if action == "RETRY_PAYMENT":
                stats.retries += 1
                if ftype in {"card_expired", "international_transaction_not_allowed"}:
                    stats.unnecessary_retries += 1
            elif action == "PAYMENT_LINK":
                stats.payment_links += 1

            if simulate_outcome(rng, ftype, action, amount, history):
                recovered = True
                break

            attempts += 1
            # Only continue loop for temporary failures that still want retry
            if action != "RETRY_PAYMENT":
                break

        if recovered:
            stats.recovered += 1
            stats.revenue_recovered += amount

    return stats


def stats_to_dict(s: RunStats) -> dict:
    d = asdict(s)
    d.update(
        {
            "recovery_rate": round(s.recovery_rate, 4),
            "revenue_recovery_rate": round(s.revenue_recovery_rate, 4),
            "escalation_rate": round(s.escalation_rate, 4),
            "avg_retries": round(s.avg_retries, 4),
            "unnecessary_retry_rate": round(
                s.unnecessary_retries / s.n if s.n else 0.0, 4
            ),
        }
    )
    return d


def comparison_table(baseline: RunStats, agent: RunStats) -> list[dict]:
    rows = [
        {
            "metric": "Recovery rate (cases)",
            "baseline": f"{baseline.recovery_rate * 100:.1f}%",
            "razorrecover": f"{agent.recovery_rate * 100:.1f}%",
            "delta": f"{(agent.recovery_rate - baseline.recovery_rate) * 100:+.1f} pp",
        },
        {
            "metric": "Revenue recovered (INR)",
            "baseline": f"{baseline.revenue_recovered:,.0f}",
            "razorrecover": f"{agent.revenue_recovered:,.0f}",
            "delta": f"{agent.revenue_recovered - baseline.revenue_recovered:+,.0f}",
        },
        {
            "metric": "Revenue recovery rate",
            "baseline": f"{baseline.revenue_recovery_rate * 100:.1f}%",
            "razorrecover": f"{agent.revenue_recovery_rate * 100:.1f}%",
            "delta": f"{(agent.revenue_recovery_rate - baseline.revenue_recovery_rate) * 100:+.1f} pp",
        },
        {
            "metric": "Total retries",
            "baseline": str(baseline.retries),
            "razorrecover": str(agent.retries),
            "delta": f"{agent.retries - baseline.retries:+d}",
        },
        {
            "metric": "Unnecessary retries",
            "baseline": str(baseline.unnecessary_retries),
            "razorrecover": str(agent.unnecessary_retries),
            "delta": f"{agent.unnecessary_retries - baseline.unnecessary_retries:+d}",
        },
        {
            "metric": "Payment links sent",
            "baseline": str(baseline.payment_links),
            "razorrecover": str(agent.payment_links),
            "delta": f"{agent.payment_links - baseline.payment_links:+d}",
        },
        {
            "metric": "Human escalations",
            "baseline": str(baseline.escalations),
            "razorrecover": str(agent.escalations),
            "delta": f"{agent.escalations - baseline.escalations:+d}",
        },
        {
            "metric": "Policy rejects",
            "baseline": str(baseline.rejects),
            "razorrecover": str(agent.rejects),
            "delta": f"{agent.rejects - baseline.rejects:+d}",
        },
    ]
    return rows


def breakdown_by_failure(rows: list[dict], rng: random.Random) -> dict:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        groups[map_failure_type(r)].append(r)

    out = {}
    for ftype, subset in sorted(groups.items()):
        b = run_baseline(subset, random.Random(rng.randint(0, 10_000_000)))
        a = run_razorrecover(subset, random.Random(rng.randint(0, 10_000_000)))
        out[ftype] = {
            "n": len(subset),
            "baseline_recovery_rate": round(b.recovery_rate, 4),
            "razorrecover_recovery_rate": round(a.recovery_rate, 4),
            "baseline_retries": b.retries,
            "razorrecover_retries": a.retries,
        }
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        type=Path,
        default=Path(__file__).parent / "dataset" / "synthetic_failures.csv",
    )
    parser.add_argument("--split", choices=["holdout", "train", "all"], default="holdout")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).parent / "results",
    )
    args = parser.parse_args()

    if not args.dataset.exists():
        raise SystemExit(f"Dataset missing: {args.dataset}. Run generate_data.py first.")

    with args.dataset.open(encoding="utf-8") as f:
        all_rows = list(csv.DictReader(f))

    if args.split == "all":
        rows = all_rows
    else:
        rows = [r for r in all_rows if r["split"] == args.split]

    rng_b = random.Random(args.seed)
    rng_a = random.Random(args.seed + 7)

    baseline = run_baseline(rows, rng_b)
    agent = run_razorrecover(rows, rng_a)
    table = comparison_table(baseline, agent)
    by_failure = breakdown_by_failure(rows, random.Random(args.seed + 99))

    args.out_dir.mkdir(parents=True, exist_ok=True)

    summary = {
        "split": args.split,
        "n": len(rows),
        "seed": args.seed,
        "policy": POLICY,
        "baseline": stats_to_dict(baseline),
        "razorrecover": stats_to_dict(agent),
        "comparison": table,
        "by_failure_type": by_failure,
        "notes": [
            "Offline simulation mirroring backend rules + policy (not live Gemini calls).",
            "Baseline = blind RETRY_PAYMENT up to 3 times.",
            "Ground-truth recovery probabilities are latent and action-dependent.",
        ],
    }

    json_path = args.out_dir / "comparison.json"
    json_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    md_path = args.out_dir / "comparison.md"
    lines = [
        "# RazorRecover Evaluation Results",
        "",
        f"- Split: **{args.split}**",
        f"- N: **{len(rows)}**",
        f"- Seed: `{args.seed}`",
        "",
        "## Baseline vs RazorRecover",
        "",
        "| Metric | Baseline | RazorRecover | Delta |",
        "|--------|----------|--------------|-------|",
    ]
    for row in table:
        lines.append(
            f"| {row['metric']} | {row['baseline']} | {row['razorrecover']} | {row['delta']} |"
        )
    lines.extend(
        [
            "",
            "## Method",
            "",
            "1. Generate synthetic `payment.failed` events (`generate_data.py`).",
            "2. **Baseline:** always retry up to 3 times (ignores failure type).",
            "3. **RazorRecover:** diagnose → choose action → policy gate → execute.",
            "4. Outcomes sampled from latent P(success | failure, action).",
            "",
            "Policy defaults mirror production config: "
            f"`max_retries={POLICY['max_retries']}`, "
            f"`require_human_above=Rs {POLICY['require_human_above']}`, "
            f"`max_recovery_amount=Rs {POLICY['max_recovery_amount']}`.",
            "",
        ]
    )
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Also print table
    print(f"Evaluated n={len(rows)} split={args.split}")
    print()
    print(f"{'Metric':<28} {'Baseline':>14} {'RazorRecover':>14} {'Delta':>12}")
    print("-" * 72)
    for row in table:
        print(
            f"{row['metric']:<28} {row['baseline']:>14} {row['razorrecover']:>14} {row['delta']:>12}"
        )
    print()
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")


if __name__ == "__main__":
    main()
