# RakshaPay

**Autonomous AI revenue recovery for merchants.**

When a Razorpay payment fails, RakshaPay diagnoses the failure, recommends a recovery action, runs it through merchant policy gates, executes via Razorpay (payment links + notifications), and verifies recovered rupees through webhooks — with a full audit trail on the merchant dashboard.

> **AI decides. Policy controls. Razorpay executes. Webhooks verify.**

---

## What it does

1. Listens to `payment.failed` (and demo-triggered failures)
2. Diagnoses with Gemini (rules fallback if the model is unavailable)
3. Applies hard policy limits (max amount, retries, human escalation threshold)
4. Creates Razorpay recovery payment links and can notify customers (SMS / email)
5. Confirms success on `payment.captured` → case marked **RECOVERED**
6. Surfaces live KPIs, cases, human review queue, research metrics, and settings

---

## Stack

| Layer | Tech |
|--------|------|
| Frontend | React + TypeScript + Vite + Tailwind + shadcn/ui |
| Backend | Node.js + TypeScript + Express + Prisma |
| Database | PostgreSQL (Neon) |
| Payments | Razorpay Test Mode + signed webhooks |
| AI | Google Gemini + structured rules fallback |
| Eval | Python holdout harness (`evaluation/`) |

---

## Repo layout

```
razorrecover/
├── frontend/      # Merchant dashboard (Overview, Cases, Review, Audit, Research, Settings)
├── backend/       # Agents, policy engine, Razorpay, auth, webhooks
└── evaluation/    # Synthetic failures + baseline vs agent metrics
```

---

## Quick start

### 1. Backend

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL, Razorpay Test keys, LLM_API_KEY
npm install
npx prisma generate
npx prisma db push
npm run dev
```

API health: [http://localhost:4000/health](http://localhost:4000/health)

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Dashboard: [http://localhost:5173](http://localhost:5173)

### Demo login (recruiters)

| Field | Value |
|--------|--------|
| Email | `demo@rakshapay.com` |
| Password | `demo1234` |
| Merchant | Demo Merchant |

Use **Run demo** in the top bar to trigger recovery scenarios without a real checkout.

---

## Dashboard

| Tab | Purpose |
|-----|---------|
| **Overview** | Live revenue KPIs, recovery chart, AI mix, recovery lifecycle |
| **Cases** | Searchable recovery cases + full case detail drawer |
| **Review** | Escalated (human-required) queue — merchant assign + approve / reject / request info |
| **Audit** | Immutable event trail with filters and export |
| **Research** | Holdout evaluation: baseline vs RakshaPay |
| **Settings** | Policy guardrails, notifications, webhook endpoint |

---

## Recovery loop

```
payment.failed
  → Risk + AI diagnosis + strategy
  → Policy engine (approve / escalate / reject)
  → Razorpay payment link (+ optional SMS/email notify)
  → payment.captured → verify → RECOVERED
  → Dashboard + audit trail
```

**Safety model:** the LLM only recommends. Policy authorizes. Razorpay executes. Webhooks are the source of truth.

---

## Demo scenarios

From **Run demo**:

| Scenario | What it shows |
|----------|----------------|
| Full recovery loop | Fail → AI → policy → execute → capture → RECOVERED |
| Recoverable ₹2,499 | Loyal customer path → retry / link |
| Abandoned ₹999 | Checkout abandoned → payment link |
| Escalate ₹30,000 | Above human threshold → Review tab |
| Reject ₹60,000 | Above max recovery amount → blocked |

---

## Evaluation snapshot (holdout, n=885)

| Metric | Blind retry | RakshaPay |
|--------|-------------|-----------|
| Recovery rate | 49.3% | **68.6%** |
| Revenue recovered | ₹37.7L | **₹45.0L** |
| Total retries | 2026 | **222** |
| Unnecessary retries | 1009 | **0** |

Reproduce: [evaluation/README.md](./evaluation/README.md) · Results: [evaluation/results/comparison.md](./evaluation/results/comparison.md)

---

## Environment (backend)

See `backend/.env.example`:

- `DATABASE_URL` — Neon / Postgres
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`
- `LLM_API_KEY` / `LLM_MODEL`
- `FRONTEND_URL` — CORS
- `MERCHANT_EMAIL` / `MERCHANT_NAME` — default merchant for demos (defaults to Demo Merchant)
- `RAZORPAY_NOTIFY_CUSTOMER` — SMS/email on payment link create

Webhook URL to register in Razorpay Test Mode:

```text
https://YOUR_API_HOST/webhooks/razorpay
```

Events: `payment.failed`, `payment.captured`

---

## License

Private project — all rights reserved.
