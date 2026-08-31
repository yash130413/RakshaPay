# RazorRecover Evaluation

Offline experiment: **Baseline (blind retry)** vs **RazorRecover (diagnose → strategy → policy)**.

## Quick run

```bash
cd evaluation
python generate_data.py --n 3000 --seed 42
python evaluate.py --split holdout --seed 42
```

Outputs:

- `dataset/synthetic_failures.csv`
- `results/comparison.json`
- `results/comparison.md`

No extra pip packages required (stdlib only).

## What is measured

| Metric | Meaning |
|--------|---------|
| Recovery rate | Share of failed cases that recover |
| Revenue recovered | Sum of INR recovered |
| Retries | Blind/agent retry attempts |
| Unnecessary retries | Retries on expired/international failures |
| Escalations | Human review path |
| Policy rejects | Above max recovery amount |

## Design notes

- Mirrors `backend` rules + policy defaults (not live Gemini — reproducible for the report).
- Ground-truth P(success \| failure, action) is latent in the simulator.
- Holdout split is the primary reported number.
