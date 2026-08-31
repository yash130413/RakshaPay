"""
Generate a synthetic held-out dataset of Razorpay-like payment failures.

Usage:
  python generate_data.py
  python generate_data.py --n 5000 --seed 42
"""

from __future__ import annotations

import argparse
import csv
import json
import random
from pathlib import Path

FAILURE_TYPES = [
    ("insufficient_funds", 0.20),
    ("card_expired", 0.24),
    ("international_transaction_not_allowed", 0.16),
    ("authentication_failed", 0.14),
    ("bank_decline", 0.16),
    ("network_error", 0.10),
]

AMOUNT_BUCKETS = [
    # (min_inr, max_inr, weight)
    (199, 999, 0.25),
    (1000, 4999, 0.35),
    (5000, 14999, 0.22),
    (15000, 24999, 0.10),
    (25000, 49999, 0.06),
    (50000, 90000, 0.02),
]


def weighted_choice(rng: random.Random, items: list[tuple[str, float]]) -> str:
    labels, weights = zip(*items)
    return rng.choices(list(labels), weights=list(weights), k=1)[0]


def sample_amount(rng: random.Random) -> int:
    ranges = [(lo, hi) for lo, hi, _ in AMOUNT_BUCKETS]
    weights = [w for _, _, w in AMOUNT_BUCKETS]
    lo, hi = rng.choices(ranges, weights=weights, k=1)[0]
    return rng.randint(lo, hi)


def true_recovery_prob(failure: str, action: str, amount: int, history: int) -> float:
    """
    Latent ground-truth P(success | failure, action).
    Used only for simulation — not visible to the agent.
    """
    base = {
        "insufficient_funds": {
            "RETRY_PAYMENT": 0.72,
            "PAYMENT_LINK": 0.55,
            "METHOD_UPDATE": 0.40,
            "HUMAN_ESCALATION": 0.50,
            "WAIT": 0.20,
            "STOP": 0.0,
        },
        "card_expired": {
            "RETRY_PAYMENT": 0.08,
            "PAYMENT_LINK": 0.68,
            "METHOD_UPDATE": 0.70,
            "HUMAN_ESCALATION": 0.45,
            "WAIT": 0.05,
            "STOP": 0.0,
        },
        "international_transaction_not_allowed": {
            "RETRY_PAYMENT": 0.05,
            "PAYMENT_LINK": 0.62,
            "METHOD_UPDATE": 0.58,
            "HUMAN_ESCALATION": 0.40,
            "WAIT": 0.05,
            "STOP": 0.0,
        },
        "authentication_failed": {
            "RETRY_PAYMENT": 0.22,
            "PAYMENT_LINK": 0.60,
            "METHOD_UPDATE": 0.52,
            "HUMAN_ESCALATION": 0.42,
            "WAIT": 0.15,
            "STOP": 0.0,
        },
        "bank_decline": {
            "RETRY_PAYMENT": 0.12,
            "PAYMENT_LINK": 0.52,
            "METHOD_UPDATE": 0.48,
            "HUMAN_ESCALATION": 0.40,
            "WAIT": 0.10,
            "STOP": 0.0,
        },
        "network_error": {
            "RETRY_PAYMENT": 0.58,
            "PAYMENT_LINK": 0.50,
            "METHOD_UPDATE": 0.35,
            "HUMAN_ESCALATION": 0.35,
            "WAIT": 0.25,
            "STOP": 0.0,
        },
    }[failure].get(action, 0.2)

    # Prior successful payments improve recoverable cases slightly
    if history >= 3 and action in {"RETRY_PAYMENT", "PAYMENT_LINK"}:
        base += 0.06
    if amount >= 25000 and action != "HUMAN_ESCALATION":
        base -= 0.08
    return max(0.0, min(0.95, base))


def generate_row(rng: random.Random, idx: int) -> dict:
    failure = weighted_choice(rng, FAILURE_TYPES)
    amount = sample_amount(rng)
    history = rng.choices([0, 1, 2, 3, 5, 8], weights=[0.25, 0.2, 0.2, 0.15, 0.12, 0.08], k=1)[0]
    method = rng.choice(["card", "card", "card", "upi", "netbanking"])
    split = "train" if rng.random() < 0.7 else "holdout"

    reason_map = {
        "insufficient_funds": "insufficient funds",
        "card_expired": "card expired",
        "international_transaction_not_allowed": "international_transaction_not_allowed",
        "authentication_failed": "authentication failed",
        "bank_decline": "bank decline",
        "network_error": "network error",
    }

    return {
        "event_id": f"evt_syn_{idx:05d}",
        "payment_id": f"pay_syn_{idx:05d}",
        "amount_inr": amount,
        "currency": "INR",
        "method": method,
        "failure_reason": reason_map[failure],
        "failure_type": failure,
        "successful_payments": history,
        "split": split,
        "p_retry": round(true_recovery_prob(failure, "RETRY_PAYMENT", amount, history), 4),
        "p_link": round(true_recovery_prob(failure, "PAYMENT_LINK", amount, history), 4),
        "p_human": round(true_recovery_prob(failure, "HUMAN_ESCALATION", amount, history), 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate RazorRecover evaluation dataset")
    parser.add_argument("--n", type=int, default=3000, help="Number of synthetic failures")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).parent / "dataset" / "synthetic_failures.csv",
    )
    args = parser.parse_args()

    rng = random.Random(args.seed)
    rows = [generate_row(rng, i) for i in range(1, args.n + 1)]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    meta = {
        "n": args.n,
        "seed": args.seed,
        "holdout": sum(1 for r in rows if r["split"] == "holdout"),
        "train": sum(1 for r in rows if r["split"] == "train"),
        "path": str(args.out),
    }
    meta_path = args.out.with_suffix(".meta.json")
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print(f"Wrote {args.n} rows -> {args.out}")
    print(f"Holdout={meta['holdout']} train={meta['train']} seed={args.seed}")


if __name__ == "__main__":
    main()
