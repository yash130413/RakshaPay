# RakshaPay Evaluation

Offline experiment: **Baseline (blind retry)** vs **RakshaPay agent (diagnose → strategy → policy)**.

This harness measures whether a bounded recovery agent recovers more revenue with fewer wasteful retries than “always retry.” It mirrors backend policy defaults (not live Gemini) so results stay reproducible.

> Product brand: **RakshaPay** · Repo / package names may still say `razorrecover`.

---

## Quick run

```bash
cd evaluation
python generate_data.py --n 3000 --seed 42
python evaluate.py --split holdout --seed 42
```

Outputs (written under `results/`):

- `dataset/synthetic_failures.csv`
- `results/comparison.json`
- `results/comparison.md`

No extra pip packages required (Python stdlib only).

After regenerating, copy the holdout numbers into `backend/src/analytics/eval.snapshot.ts` if the Research tab should match the new run.

---

## What is measured

| Metric | Meaning |
|--------|---------|
| Recovery rate | Share of failed cases that recover |
| Revenue recovered | Sum of INR recovered |
| Retries | Blind / agent retry attempts |
| Unnecessary retries | Retries on expired / international-style failures |
| Escalations | Human review path (above `requireHumanAbove`) |
| Policy rejects | Above `maxRecoveryAmount` |

---

## Holdout snapshot (committed)

Committed reference run (also shown on the dashboard **Research** tab):

| Metric | Blind retry | RakshaPay |
|--------|-------------|-----------|
| Recovery rate | 49.3% | **68.6%** |
| Revenue recovered | ₹37.7L | **₹45.0L** |
| Total retries | 2026 | **222** |
| Unnecessary retries | 1009 | **0** |

- Split: **holdout** · N: **885** · Seed: `42`
- Details: [results/comparison.md](./results/comparison.md) · [results/comparison.json](./results/comparison.json)

---

## Method

1. Generate synthetic `payment.failed` events (`generate_data.py`).
2. **Baseline:** always retry (ignores failure type / diagnosis).
3. **RakshaPay agent:** diagnose → choose action → policy gate → execute (retry / link / escalate / stop).
4. Outcomes sampled from latent P(success \| failure, action).

Policy defaults mirror production: `max_retries=2`, `require_human_above=₹25,000`, `max_recovery_amount=₹50,000`.

---

## Design notes

- Rules + policy only — **not** live Gemini — so judges can re-run and get the same table.
- Holdout split is the primary reported number (train/other splits exist in the scripts).
- This offline harness focuses on payment-failure recovery paths. Live product demos also cover **mandate sequencer**, **B2B receivables**, and **promise-to-pay** (see root [README.md](../README.md)); those are exercised in the dashboard, not this Python sim.

---

## Live product

- Dashboard: [https://raksha-pay-eight.vercel.app/](https://raksha-pay-eight.vercel.app/)
- API: [https://rakshapay.onrender.com](https://rakshapay.onrender.com)
