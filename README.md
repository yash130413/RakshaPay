# RazorRecover

**Autonomous AI Revenue Recovery Agent for Razorpay Merchants**

Track 03 — Razorpay AI Buildathon / AI Builder Internship

## Core principle

> AI decides. Policy controls. Razorpay executes. Webhooks verify. Dashboard proves the money.

## Loop

```
payment.failed
  → Risk → Gemini Diagnosis → Gemini Strategy
  → Policy Engine → Razorpay Test API
  → payment.captured → Verify → ₹ Recovered
  → Dashboard + Audit Trail
```

## Stack

| Layer | Tech |
|--------|------|
| Frontend | React + TypeScript + Vite |
| Backend | Node.js + TypeScript + Express + Zod + Prisma |
| Database | PostgreSQL (Neon) |
| Payments | Razorpay Test Mode + webhooks |
| AI | Google Gemini (`gemini-3.6-flash`) + Zod + rules fallback |
| Eval | Python (scaffold) |

## Monorepo

```
razorrecover/
├── frontend/      # Merchant recovery dashboard
├── backend/       # Agents, policy, Razorpay, webhooks
├── evaluation/    # Synthetic dataset + metrics
└── docs/          # Architecture, API, setup, demo
```

## Documentation

Start here: **[docs/README.md](./docs/README.md)**

| Doc | Link |
|-----|------|
| Product overview | [docs/product-overview.md](./docs/product-overview.md) |
| Architecture | [docs/architecture.md](./docs/architecture.md) |
| API reference | [docs/api-reference.md](./docs/api-reference.md) |
| Setup & testing | [docs/setup-and-testing.md](./docs/setup-and-testing.md) |
| 5-min demo script | [docs/demo-script.md](./docs/demo-script.md) |

## Quick start

### Backend

```bash
cd backend
cp .env.example .env
# Fill DATABASE_URL, Razorpay Test keys, LLM_API_KEY
npm install
npx prisma generate
npx prisma db push
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

- API: `http://localhost:4000/health`
- UI: `http://localhost:5173`

Full instructions: [docs/setup-and-testing.md](./docs/setup-and-testing.md).

## Current status

| Area | Status |
|------|--------|
| Webhooks + idempotency + signature verify | Done |
| Policy engine | Done |
| Gemini diagnosis + strategy (rules fallback) | Done |
| Razorpay Test payment link execution | Done |
| `payment.captured` → RECOVERED | Done |
| Merchant dashboard (metrics + cases) | Done |
| Evaluation harness / deploy polish | In progress |

## Safety model

The LLM **recommends** only. The **policy engine** authorizes. **Razorpay** executes. **Webhooks** verify. Nothing moves without those gates.
