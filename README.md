# RazorRecover

**Autonomous AI Revenue Recovery Agent for Razorpay Merchants**

Track 03 — Razorpay AI Buildathon / AI Builder Internship

## Core principle

> AI decides. Policy controls. Razorpay executes. Webhooks verify. Dashboard proves the money.

## Loop

```
payment.failed → Risk → Diagnose → Strategy → Policy → Razorpay Test API → Webhook → Verify → ₹ Recovered
```

## Stack

| Layer | Tech |
|--------|------|
| Frontend | React + TypeScript + Vite + Tailwind + shadcn/ui + Recharts |
| Backend | Node.js + TypeScript + Express + Zod + Prisma |
| Database | PostgreSQL (Supabase) |
| Payments | Razorpay Test Mode |
| AI | LLM API + structured JSON |
| Eval | Python |

## Monorepo

```
razorrecover/
├── frontend/     # Merchant recovery dashboard
├── backend/      # Agents, policy, Razorpay, webhooks
├── evaluation/   # Synthetic dataset + metrics
└── docs/         # Architecture + demo script
```

## Quick start (Day 1)

### Backend

```bash
cd backend
cp .env.example .env
# Fill RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, DATABASE_URL
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

## Status

Day 1 scaffold: architecture folders, Prisma schema, webhook stub, Razorpay adapter, recovery workflow skeleton.
