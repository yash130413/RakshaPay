# RakshaPay — Setup & Testing Guide

Complete local setup for development and testing.

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| Node.js 20+ | Backend + frontend |
| npm | Packages |
| Neon account (or Postgres) | Database |
| Razorpay Test Mode account | Keys + webhooks |
| Google AI Studio key | Gemini |
| ngrok (optional) | Public URL for Razorpay → localhost |
| Docker (optional) | Local Postgres via `docker-compose.yml` |

---

## 1. Clone & install

```bash
cd razorrecover/backend
npm install

cd ../frontend
npm install
```

---

## 2. Database (Neon recommended)

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the connection string (include `sslmode=require`)
3. Set in `backend/.env`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require"
```

**Alternative:** `docker compose up -d` from repo root (Postgres `localhost:5432`, user/pass/db `postgres` / `postgres` / `razorrecover`).

Then:

```bash
cd backend
npx prisma generate
npx prisma db push
```

---

## 3. Environment variables

Copy `backend/.env.example` → `backend/.env` and fill:

```env
PORT=4000
NODE_ENV=development
DATABASE_URL="..."

RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

LLM_API_KEY=...                 # Google AI Studio
LLM_MODEL=gemini-3.6-flash

FRONTEND_URL=http://localhost:5173
```

### Where to get secrets

| Secret | Source |
|--------|--------|
| Razorpay keys | Dashboard → **Test Mode** → Settings → API Keys |
| Webhook secret | Settings → Webhooks → create endpoint → secret |
| Gemini key | [Google AI Studio](https://aistudio.google.com/apikey) |

**Frontend** `frontend/.env` (optional):

```env
VITE_API_URL=http://localhost:4000
```

---

## 4. Run services

**Terminal 1 — API**

```bash
cd backend
npm run dev
```

Expect: `RazorRecover API listening on http://localhost:4000`

**Terminal 2 — UI**

```bash
cd frontend
npm run dev
```

Open: `http://localhost:5173`

**Terminal 3 — ngrok (only for live Razorpay webhooks)**

```bash
ngrok http 4000
```

Razorpay webhook URL:

```text
https://YOUR_SUBDOMAIN.ngrok-free.dev/webhooks/razorpay
```

Subscribe at least to: `payment.failed`, `payment.captured`.

> ngrok URLs change on restart — update Razorpay webhook URL each time.

---

## 5. Smoke checks

### Health

```text
GET http://localhost:4000/health
```

Require: `"ok": true`, `"llm.configured": true` when testing Gemini.

### Prisma / DB

```text
GET http://localhost:4000/api/recovery/cases
```

Should return `[]` or an array (not connection errors).

---

## 6. Test playbook

### Test A — Signed webhook (no ngrok)

Use PowerShell HMAC script from [api-reference.md](./api-reference.md).

**Pass criteria**

- Response `{ ok: true }`
- New case in `/api/recovery/cases`
- Dashboard metrics update
- `decisions` show `*_gemini` when LLM healthy

### Test B — Gemini vs rules

Inspect case:

```text
GET /api/recovery/cases/:id
```

| `agent` value | Meaning |
|---------------|---------|
| `diagnosis_gemini` / `strategy_gemini` | LLM path |
| `diagnosis_rules` / `strategy_rules` | Fallback |

**Common Gemini failures**

| Log message | Fix |
|-------------|-----|
| `404 ... model no longer available` | Set `LLM_MODEL=gemini-3.6-flash` (or current AI Studio model) |
| `Gemini request timed out` | Wait / retry; timeout is 30s; check network/VPN |
| `LLM_API_KEY missing` | Set key + restart `npm run dev` |

### Test C — Razorpay execution

After a failed payment case:

- Action `status` should be `executed`
- `razorpayRefId` like `plink_...`
- `metadata.shortUrl` openable in Test Mode

If execute fails (`ok: false`), verify Test keys and Razorpay account state.

Re-run:

```http
POST /api/recovery/cases/:id/execute
```

### Test D — Recovery confirmation

**Real:** Pay Test link successfully with ngrok webhook → `payment.captured` → `RECOVERED`.

**Dev:**

```http
POST /api/recovery/cases/:id/simulate-capture
```

Dashboard **Recovered** should increase.

### Test E — Policy escalation (optional)

Trigger failure with amount **> ₹25,000** (e.g. `2500100` paise) and show `ESCALATED` / human path.

---

## 7. Daily restart checklist

After closing the laptop overnight:

1. `backend` → `npm run dev`
2. `frontend` → `npm run dev`
3. Confirm `/health`
4. ngrok only if testing live Razorpay webhooks; update webhook URL
5. Prefer new webhook `event.id` for each test

---

## 8. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `@prisma/client did not initialize` | `npx prisma generate` |
| Can't reach database | Neon URL / SSL / sleep; wake Neon project |
| Dashboard ₹0 always | No webhooks yet; CORS / wrong `VITE_API_URL` |
| Invalid signature | Wrong webhook secret or body mutated |
| International card not supported | Checkout UX fail without payment entity — use signed webhook or Indian Test cards |
| Cases stuck `WAITING_FOR_WEBHOOK` | Expected until capture / simulate-capture |

---

## 9. Related docs

- [architecture.md](./architecture.md) — system design  
- [api-reference.md](./api-reference.md) — endpoints  
- [demo-script.md](./demo-script.md) — 5-minute pitch  
- [product-overview.md](./product-overview.md) — problem / solution  
