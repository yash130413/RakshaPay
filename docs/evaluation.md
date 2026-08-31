# Evaluation Guide

Offline held-out experiment comparing **blind retry baseline** vs **RazorRecover** (rules + policy mirrored from the backend).

## Reproduce

```bash
cd evaluation
python generate_data.py --n 3000 --seed 42
python evaluate.py --split holdout --seed 42
```

## Latest results (seed=42, holdout n=885)

| Metric | Baseline | RazorRecover | Delta |
|--------|----------|--------------|-------|
| Recovery rate (cases) | 49.3% | 68.6% | +19.3 pp |
| Revenue recovered (INR) | 3,771,646 | 4,503,538 | +731,892 |
| Revenue recovery rate | 46.1% | 55.0% | +8.9 pp |
| Total retries | 2026 | 222 | -1804 |
| Unnecessary retries | 1009 | 0 | -1009 |
| Payment links sent | 0 | 614 | +614 |
| Human escalations | 0 | 100 | +100 |
| Policy rejects | 0 | 16 | +16 |

Artifacts: `evaluation/results/comparison.md`, `comparison.json`.

## Interpretation for judges

RazorRecover wins by **choosing the right action** (payment links for expired/international cards instead of blind retries) and **policy-gating** high-value cases. Fewer retries + more recovered revenue is the core claim.
