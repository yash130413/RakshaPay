# RakshaPay Evaluation Results

- Split: **holdout**
- N: **885**
- Seed: `42`

## Baseline vs RakshaPay

| Metric | Baseline | RakshaPay | Delta |
|--------|----------|-----------|-------|
| Recovery rate (cases) | 49.3% | 68.6% | +19.3 pp |
| Revenue recovered (INR) | 3,771,646 | 4,503,538 | +731,892 |
| Revenue recovery rate | 46.1% | 55.0% | +8.9 pp |
| Total retries | 2026 | 222 | -1804 |
| Unnecessary retries | 1009 | 0 | -1009 |
| Payment links sent | 0 | 614 | +614 |
| Human escalations | 0 | 100 | +100 |
| Policy rejects | 0 | 16 | +16 |

## Method

1. Generate synthetic `payment.failed` events (`generate_data.py`).
2. **Baseline:** always retry up to 3 times (ignores failure type).
3. **RakshaPay:** diagnose → choose action → policy gate → execute.
4. Outcomes sampled from latent P(success | failure, action).

Policy defaults mirror production config: `max_retries=2`, `require_human_above=Rs 25000`, `max_recovery_amount=Rs 50000`.

Regenerate with:

```bash
cd evaluation
python generate_data.py --n 3000 --seed 42
python evaluate.py --split holdout --seed 42
```

Dashboard Research tab reads the same snapshot from `backend/src/analytics/eval.snapshot.ts`.
