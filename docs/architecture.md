# RazorRecover Architecture

## Principle

AI decides. Policy controls. Razorpay executes. Webhooks verify. Dashboard proves the money.

## Workflow states

```
RECEIVED → ANALYZING → DIAGNOSED → ACTION_SELECTED → POLICY_CHECK
→ APPROVED | REJECTED | ESCALATED → EXECUTING → WAITING_FOR_WEBHOOK
→ RECOVERED | FAILED
```

## Modules

| Module | Responsibility |
|--------|----------------|
| `razorpay/` | Test API adapter + webhook verify/idempotency |
| `agents/` | Risk, Diagnosis, Strategy, Verifier |
| `policy/` | Hard gates (retries, amount, escalation) |
| `workflows/` | Bounded state machine |
| `audit/` | Immutable event trail |
| `analytics/` | ₹ at risk / recovered / rate |

## Day 1–2 done

- Monorepo scaffold
- Prisma schema
- Webhook handler (signature + idempotency)
- Rule-based agents (LLM comes Day 3)
- Policy engine
- Recovery workflow state machine
- **Real Razorpay Test Mode execution** (`PAYMENT_LINK` / retry / method update → payment link)
- **`payment.captured` → RECOVERED** with `recoveredAmount` + audit
- Analytics + cases APIs + dashboard case list
- Dev helpers: `POST /api/recovery/cases/:id/execute`, `POST /api/recovery/cases/:id/simulate-capture`
