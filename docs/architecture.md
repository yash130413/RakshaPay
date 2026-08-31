# RazorRecover — System Architecture

**Track 03 · Razorpay AI Buildathon / AI Builder Internship**  
**Product:** Autonomous AI revenue recovery agent for Razorpay merchants

---

## 1. Design principle

> **AI decides. Policy controls. Razorpay executes. Webhooks verify. Dashboard proves the money.**

| Layer | Authority | Notes |
|--------|-----------|--------|
| **AI (Gemini)** | Recommend only | Structured JSON; never moves money |
| **Policy engine** | Hard gate | Deterministic TypeScript rules; LLM cannot bypass |
| **Razorpay Test APIs** | Execute | Payment links / recovery actions |
| **Webhooks** | Truth | Signature-verified, idempotent events |
| **Dashboard** | Proof | At-risk ₹, recovered ₹, cases, audit |

This separation is intentional for production-style financial agents: unbounded LLM tool-calling is unsafe; bounded recommendation + policy is defensible in interview and production.

---

## 2. End-to-end recovery loop

```
Razorpay Test Mode
        │
        │  payment.failed  (HMAC-signed webhook)
        ▼
┌───────────────────┐
│ Webhook Handler   │  verify signature → idempotency → store event
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Risk Agent        │  Is revenue actually at risk?
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Diagnosis Agent   │  Gemini → structured JSON (rules fallback)
│ (Why did it fail?)│
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Strategy Agent    │  Gemini → recommendedAction enum (rules fallback)
│ (What to do?)     │
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Policy Engine     │  APPROVED | REJECTED | ESCALATE
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Recovery Executor │  Razorpay paymentLink.create (Test Mode)
└─────────┬─────────┘
          ▼
     WAITING_FOR_WEBHOOK
          │
          │  payment.captured
          ▼
┌───────────────────┐
│ Verifier          │  Case → RECOVERED + recoveredAmount
└─────────┬─────────┘
          ▼
   Dashboard metrics + immutable audit trail
```

---

## 3. Bounded state machine

Every recovery case advances through an explicit status enum (`RecoveryCaseStatus` in Prisma):

```
RECEIVED
   → ANALYZING
   → DIAGNOSED
   → ACTION_SELECTED
   → POLICY_CHECK
   → APPROVED | REJECTED | ESCALATED
   → EXECUTING
   → WAITING_FOR_WEBHOOK
   → RECOVERED | FAILED
```

| Status | Meaning |
|--------|---------|
| `RECEIVED` | Failed payment ingested |
| `ANALYZING` | Risk detection running |
| `DIAGNOSED` | Failure cause labeled |
| `ACTION_SELECTED` | Recovery action chosen |
| `POLICY_CHECK` | Merchant policy evaluation |
| `APPROVED` | Policy allowed execution |
| `REJECTED` | Policy blocked (e.g. amount too high) |
| `ESCALATED` | Human review required |
| `EXECUTING` | Calling Razorpay APIs |
| `WAITING_FOR_WEBHOOK` | Payment link live; awaiting capture |
| `RECOVERED` | Money confirmed via `payment.captured` (or simulated capture in dev) |
| `FAILED` | Execution error or non-recoverable path |

---

## 4. Technology stack (locked)

| Layer | Choice | Why |
|--------|--------|-----|
| Frontend | React + TypeScript + Vite | Fast dashboard; TypeScript end-to-end |
| Styling | CSS (Vite app) | Lean MVP UI; metrics + case list |
| Backend | Node.js + TypeScript + Express | Matches builder skills; single deployable API |
| Validation | Zod | LLM JSON + request schemas |
| ORM | Prisma | Typed models, fast iteration |
| Database | PostgreSQL (Neon) | Cloud Postgres; no local Docker required |
| Payments | Razorpay Test Mode SDK | Real APIs + webhooks, zero live money |
| Local tunnel | ngrok | Expose `localhost:4000` for Razorpay webhooks |
| AI | Google Gemini (`gemini-3.6-flash`) | Free-tier capable; JSON mode; structured outputs |
| Agent orchestration | Custom TS state machine | Controllable, explainable — no LangGraph dependency |
| Evaluation | Python (planned / scaffold) | Synthetic dataset + baseline vs agent metrics |
| Deploy (target) | Vercel (FE) + Render (API) + Neon (DB) | Simple internship demo hosting |

**Explicitly out of scope for the sprint:** Kafka, Redis, Kubernetes, microservices, unrestricted LLM tool calling.

---

## 5. Repository layout

```
razorrecover/
├── frontend/                 # Merchant recovery dashboard (Vite + React)
│   └── src/
│       ├── App.tsx           # Metrics + AI actions + recovery cases
│       └── ...
├── backend/
│   ├── prisma/schema.prisma  # Domain model + enums
│   └── src/
│       ├── agents/
│       │   ├── llm.client.ts       # Gemini client, timeout, Zod parse
│       │   ├── diagnosis.agent.ts  # LLM diagnosis + fallback
│       │   ├── strategy.agent.ts   # LLM strategy + fallback
│       │   ├── rules.ts            # Deterministic fallback rules
│       │   ├── types.ts
│       │   └── index.ts            # Public agent API
│       ├── policy/policy.engine.ts
│       ├── workflows/recovery.workflow.ts
│       ├── recovery/
│       │   ├── recovery.executor.ts
│       │   └── recovery.router.ts
│       ├── razorpay/
│       │   ├── razorpay.service.ts
│       │   └── webhook.handler.ts
│       ├── audit/audit.service.ts
│       ├── analytics/analytics.router.ts
│       ├── db.ts
│       └── server.ts
├── evaluation/               # Synthetic data + metrics scripts
├── docs/                     # This documentation set
├── docker-compose.yml        # Optional local Postgres
└── README.md
```

---

## 6. Domain model (PostgreSQL / Prisma)

### Core entities

| Model | Role |
|--------|------|
| `Merchant` | Tenant; owns policies |
| `Customer` | Payer profile (optional linkage) |
| `Payment` | Razorpay payment mirror (`razorpayPaymentId`) |
| `RecoveryCase` | One recovery workflow instance |
| `AIDecision` | Per-agent decision snapshot (`rawJson`, agent name) |
| `RecoveryAction` | Policy decision + Razorpay ref + status |
| `RecoveryResult` | Verified recovery outcome |
| `WebhookEvent` | Raw event store + idempotency (`eventId` unique) |
| `AuditLog` | Append-only timeline |
| `Policy` | Merchant limits (retries, amounts, flags) |

### Money representation

- Amounts stored in **paise** (integer), consistent with Razorpay.
- Dashboard / analytics APIs convert to **INR** (`/ 100`).

### Default merchant policy

| Field | Default | Effect |
|--------|---------|--------|
| `maxRetries` | `2` | Retry exhaustion → escalate |
| `maxRecoveryAmount` | `50000` (₹) | Above → `REJECTED` |
| `requireHumanAbove` | `25000` (₹) | Above → `ESCALATE` |
| `allowPaymentLink` | `true` | If false → reject `PAYMENT_LINK` |

---

## 7. AI agents

### 7.1 Risk Detector

- **Implementation:** Rules-first (fast, deterministic).
- **Input:** `eventType`, `amount`.
- **Output:** `{ isRevenueAtRisk, reason, confidence, source }`.
- `payment.failed` → at risk; `payment.captured` → not at risk for new recovery.

### 7.2 Diagnosis Agent

- **Primary:** Google Gemini with JSON response MIME type.
- **Fallback:** `rules.ts` if key missing, timeout, 404, or Zod failure.
- **Audit agent label:** `diagnosis_gemini` | `diagnosis_rules`.
- **Schema (conceptual):**

```json
{
  "diagnosis": "insufficient_funds",
  "confidence": 0.0,
  "failureCategory": "insufficient_funds",
  "reason": "one sentence"
}
```

### 7.3 Strategy Agent

- **Primary:** Gemini; action must be in enum whitelist.
- **Fallback:** Rules.
- **Audit agent label:** `strategy_gemini` | `strategy_rules`.
- **Allowed actions:**

| Action | Intent |
|--------|--------|
| `RETRY_PAYMENT` | Temporary failure, low attempt count |
| `PAYMENT_LINK` | Fresh collect link (primary recovery path in MVP) |
| `METHOD_UPDATE` | Expired / bad method → still executed as payment link in MVP |
| `WAIT` | No Razorpay call |
| `HUMAN_ESCALATION` | Policy / strategy defer to human |
| `STOP` | Stop automatic recovery |

### 7.4 Verifier

- Rules-based: `payment.captured` → success + `recoveredAmount`.
- Updates case to `RECOVERED`, writes `RecoveryResult`, marks actions `succeeded`.

### 7.5 LLM client behaviour

| Concern | Behaviour |
|---------|-----------|
| Provider | `@google/generative-ai` |
| Default model | `gemini-3.6-flash` (`LLM_MODEL` env override) |
| Timeout | 30 seconds; then rules fallback |
| Validation | Zod `safeParse`; invalid → fallback |
| Safety | No Razorpay credentials in prompts; recommend-only prompts |

---

## 8. Policy engine

`evaluatePolicy()` is the **authority layer**. Order of checks:

1. Amount > `maxRecoveryAmount` → **REJECTED**
2. Amount > `requireHumanAbove` → **ESCALATE**
3. `RETRY_PAYMENT` and attempts ≥ `maxRetries` → **ESCALATE**
4. `PAYMENT_LINK` and `allowPaymentLink === false` → **REJECTED**
5. Action is `HUMAN_ESCALATION` or `STOP` → **ESCALATE**
6. Else → **APPROVED**

The LLM never calls Razorpay. Only the executor runs after `APPROVED`.

---

## 9. Razorpay integration

### Adapter (`RazorpayService`)

| Method | Purpose |
|--------|---------|
| `verifyWebhookSignature` | HMAC-SHA256 vs `RAZORPAY_WEBHOOK_SECRET` |
| `createPaymentLink` | Test Mode recovery link; notes include `recovery_case_id` |
| `getPayment` / `getSubscription` | Fetch helpers |

### Webhook pipeline

1. Raw body middleware on `/webhooks/razorpay`
2. Signature verification (reject → 400 + audit)
3. Idempotency on Razorpay `event.id`
4. Persist `WebhookEvent`
5. Dispatch `payment.failed` / `payment.captured` → workflow
6. Mark event `processed`

### Execution

On policy approval, `executeRecoveryAction`:

- Creates Razorpay payment link with notes `{ recovery_case_id, recovery_action, source: razorrecover }`
- Stores `razorpayRefId`, `shortUrl` in `RecoveryAction.metadata`
- Case → `WAITING_FOR_WEBHOOK`

On `payment.captured`:

- Prefer match via `notes.recovery_case_id`
- Fallback: oldest `WAITING_FOR_WEBHOOK` case (same amount / merchant)
- Set `RECOVERED` + `recoveredAmount`

---

## 10. HTTP API surface

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness + LLM configured flag |
| `POST` | `/webhooks/razorpay` | Razorpay webhooks (raw body) |
| `GET` | `/api/analytics/summary` | At risk / recovered / rate / escalated / rejected counts |
| `GET` | `/api/recovery/cases` | Recent cases + actions + decisions + audits |
| `GET` | `/api/recovery/cases/:id` | Full case detail |
| `POST` | `/api/recovery/demo/trigger` | Demo scenarios: recoverable / escalate / reject |
| `POST` | `/api/recovery/cases/:id/execute` | Re-run Razorpay execution for queued cases |
| `POST` | `/api/recovery/cases/:id/simulate-capture` | Dev-only capture simulation |
| `GET` | `/api/recovery/audit` | Global audit log |

See also: [api-reference.md](./api-reference.md).

---

## 11. Frontend dashboard

- Polls `/api/analytics/summary` and `/api/recovery/cases` every 5s
- Shows: At Risk, Recovered, Recovery Rate, Cases
- AI Actions aggregate (`PAYMENT_LINK — N`)
- Recovery Cases list: amount, status badge, diagnosis → action, recovery link when present

Principle tagline on UI matches architecture quote.

---

## 12. Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon / Postgres connection string |
| `PORT` | No | Default `4000` |
| `FRONTEND_URL` | No | CORS origin, default Vite `5173` |
| `RAZORPAY_KEY_ID` | Yes (exec) | Test key id |
| `RAZORPAY_KEY_SECRET` | Yes (exec) | Test key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Yes (webhooks) | Webhook HMAC secret |
| `LLM_API_KEY` | Yes (Gemini) | Google AI Studio key |
| `LLM_MODEL` | No | Default `gemini-3.6-flash` |

Never commit real secrets. Use `.env` locally; `.env.example` as template.

---

## 13. Security & production constraints

- Webhook signatures verified with timing-safe compare
- Duplicate event IDs ignored
- AI outputs validated against enums / Zod
- Policy hard-stops retries and high amounts
- Test Mode only for demo (no live settlements)
- Audit log for every material step (demo + debugging + interview narrative)

---

## 14. Build progress (sprint)

| Phase | Status | Deliverable |
|--------|--------|-------------|
| Day 1 | Done | Schema, webhook skeleton, policy, rule agents, APIs |
| Day 2 | Done | Real Razorpay execute, capture → RECOVERED, dashboard cases |
| Day 3 | Done | Gemini diagnosis + strategy + 30s timeout + rules fallback |
| Day 4–5 | Done | Audit Trail UI, case detail, demo escalate/reject triggers |
| Day 6 | Planned | Dashboard polish / audit UI |
| Day 7 | Done | Offline eval: baseline vs RazorRecover on holdout synthetic set |
| Day 8–9 | Planned | Deploy + README + 5-min pitch |

---

## 15. Related docs

| Doc | Contents |
|-----|----------|
| [setup-and-testing.md](./setup-and-testing.md) | Local run, Neon, ngrok, Gemini, test playbook |
| [api-reference.md](./api-reference.md) | Endpoints, payloads, examples |
| [demo-script.md](./demo-script.md) | 5-minute judge / interviewer demo |
| [product-overview.md](./product-overview.md) | Problem, solution, differentiators |
