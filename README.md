# RakshaPay

**Autonomous AI revenue recovery for merchants.**

When revenue slips — failed Razorpay payments, abandoned checkouts, failed mandates, overdue B2B invoices, or a customer promise-to-pay — RakshaPay detects risk, diagnoses the cause, chooses a bounded intervention, executes via Razorpay, and verifies recovered rupees through webhooks. Merchants get a live dashboard, human review queue, immutable audit trail, and an in-app **RakshaPay AI assistant** that can read live data and run actions with Confirm.

> **AI decides. Policy controls. Razorpay executes. Webhooks verify.**

Repo folder: `razorrecover` · Product brand: **RakshaPay**

---

## What it does

1. Ingests `payment.failed` (live webhook or **Run demo**)
2. Diagnoses with Gemini (deterministic rules fallback if the model is unavailable)
3. Applies hard policy gates (max amount, retries, human escalation, mandate schedule, B2B reminder caps)
4. Executes recovery (payment links, retries, reminders) and can notify customers (SMS / email)
5. Confirms success on `payment.captured` → case **RECOVERED**
6. Extends recovery beyond card fails: **mandate retry sequencer**, **B2B receivables**, **promise-to-pay**
7. Surfaces Overview / Cases / Review / Audit / Research / Settings plus the **RakshaPay assistant**

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
├── frontend/      # Merchant dashboard + RakshaPay assistant
├── backend/       # Agents, policy, Razorpay, auth, webhooks, assistant, sequencer
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
cp .env.example .env   # VITE_API_URL=http://localhost:4000
npm install
npm run dev
```

Dashboard: [http://localhost:5173](http://localhost:5173)

### Demo login

| Field | Value |
|--------|--------|
| Email | `demo@rakshapay.com` |
| Password | `demo1234` |
| Merchant | Demo Merchant |

Use **Run demo** in the top bar to trigger scenarios without a real checkout.

---

## Dashboard

| Tab | Purpose |
|-----|---------|
| **Overview** | Live revenue KPIs, recovery chart, AI mix, lifecycle |
| **RakshaPay** | In-app AI agent — live tools, Confirm writes, mic + TTS (Hindi/English) |
| **Cases** | Searchable cases + detail drawer (filters: Awaiting, Promise, Retry seq, Receivables, Assigned, …) |
| **Review** | Escalated queue — assign, then approve / reject / request info |
| **Audit** | Immutable event trail + JSON export |
| **Research** | Holdout evaluation: baseline vs RakshaPay |
| **Settings** | Policy guardrails, notify flags, mandate schedule, B2B reminders, webhook URL |

---

## Recovery loop

```
payment.failed (or sequencer / B2B / PTP demo)
  → Risk + AI diagnosis + strategy
  → Policy engine (approve / escalate / reject)
  → Razorpay execute (link / retry / reminder + SMS·email)
  → WAITING_FOR_WEBHOOK  (or WAITING_PROMISE / WAITING_RETRY)
  → payment.captured → verify → RECOVERED
  → Dashboard + audit trail
```

**Safety model:** the LLM only recommends. Policy authorizes. Razorpay executes. Webhooks are the source of truth.

Extra wait states:

| Status | Meaning |
|--------|---------|
| `WAITING_FOR_WEBHOOK` | Link/retry sent — awaiting capture |
| `WAITING_PROMISE` | Customer promised a pay date |
| `WAITING_RETRY` | Mandate / receivable step scheduled |

Case sources: `PAYMENT_FAILED` · `CHECKOUT_ABANDONED` · `MANDATE_RETRY` · `B2B_INVOICE` · `PROMISE_TO_PAY`

---

## Demo scenarios

From **Run demo** (`POST /api/recovery/demo/trigger`):

| Scenario | What it shows |
|----------|----------------|
| **Full recovery loop** | Fail → AI → policy → execute → capture → `RECOVERED` |
| **Recoverable ₹2,499** | Loyal customer → retry / link |
| **Abandoned ₹999** | Checkout left → payment link |
| **Mandate sequencer** | Emandate fail → day **1 → 3 → 7** retries → stop / escalate |
| **B2B receivable** | Overdue invoice → reminders → escalate |
| **Promise-to-pay** | Fail path + promise date → chase when due |
| **Escalate ₹30,000** | Above human threshold → Review |
| **Reject ₹60,000** | Above max recovery → blocked |

**Advance time in demos:** open the case → **Run scheduler tick** (forces due PTP / mandate / B2B chase even if `nextActionAt` is in the future).

Also in the case drawer: **Set promise-to-pay (+1 day)**, **Simulate payment.captured**.

---

## Sequencer features

### Promise-to-pay
- Record a customer promise date → status `WAITING_PROMISE`
- When due (or on tick) → resend recovery payment link
- APIs: `POST /api/recovery/cases/:id/promise`, scheduler tick below

### Mandate retry sequencer
- Policy `retryScheduleDays` (default `1,3,7`) + `maxRetries` stop rule
- Each tick executes the next retry, then schedules or escalates when exhausted

### B2B receivables
- Overdue invoice cases (`invoiceNumber`, `buyerCompany`, `invoiceDueAt`)
- Reminder sequence capped by `maxInvoiceReminders` (default `3`), then human escalate
- Cases filter: **Receivables**

Scheduler:

- `GET /api/recovery/scheduler/due`
- `POST /api/recovery/scheduler/tick` — body `{ "forceCaseId": "…" }` for demos

---

## RakshaPay AI assistant

Sidebar tab **RakshaPay** — Gemini agent with live DB tools (text JSON tool protocol; Hindi/English replies). Write actions return a plan → merchant presses **Confirm / Cancel** (or types “confirm”).

| Kind | Tools |
|------|--------|
| **Read** | Dashboard summary, list/filter cases, unassigned escalated, my assigned, due sequencer actions, case detail, policy, audit, policy simulate, research metrics |
| **Write** (Confirm) | Assign / bulk-assign, review / bulk review, reassign / unassign, run demo, update policy, simulate capture, resend payment link, set promise-to-pay, run scheduler tick |
| **UI** | Open tabs / filters (`navigate_ui`), export audit JSON |

Endpoints:

- `POST /api/assistant/chat` — `{ message, history?, merchantName? }`
- `POST /api/assistant/confirm` — `{ tool, args }` with `confirmed` applied server-side

Voice: browser STT (mic) + optional TTS. Prefer Chrome/Edge.

---

## Policy guardrails (Settings)

| Field | Default | Role |
|-------|---------|------|
| `requireHumanAbove` | ₹25,000 | Escalate above |
| `maxRecoveryAmount` | ₹50,000 | Hard reject above |
| `maxRetries` | 2 | Cap auto / mandate retries |
| `retryScheduleDays` | `1,3,7` | Mandate day offsets |
| `maxInvoiceReminders` | 3 | B2B reminder cap |
| `allowPaymentLink` | true | Allow link actions |
| `notifyCustomerSms` / `notifyCustomerEmail` | true | Notify on link create |

LLM cannot bypass these — policy is deterministic TypeScript.

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

## Environment

### Backend (`backend/.env.example`)

- `DATABASE_URL` — Neon / Postgres (`sslmode=require`)
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`
- `LLM_API_KEY` / `LLM_MODEL` (default `gemini-3.6-flash`)
- `FRONTEND_URL` — CORS (default `http://localhost:5173`)
- `MERCHANT_EMAIL` / `MERCHANT_NAME` — demo merchant defaults
- `RAZORPAY_NOTIFY_CUSTOMER` — SMS/email on payment link create

### Frontend

- `VITE_API_URL=http://localhost:4000`
- Optional: `VITE_PUBLIC_API_URL` — public API host shown in Settings for webhook config

Webhook URL (Razorpay Test Mode):

```text
https://YOUR_API_HOST/webhooks/razorpay
```

Events: `payment.failed`, `payment.captured`

---

## Key API mounts

| Path | Role |
|------|------|
| `/health` | Service + LLM status |
| `/webhooks/razorpay` | Signed payment events |
| `/api/auth` | Login / me |
| `/api/policy` | GET/PUT merchant policy |
| `/api/recovery` | Cases, demos, review, simulate capture, promise, scheduler |
| `/api/assistant` | Chat + confirm |
| `/api/analytics` | Summary, series, evaluation snapshot |

---

## License

Private project — all rights reserved.
