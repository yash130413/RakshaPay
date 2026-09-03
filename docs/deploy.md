# RakshaPay — Deploy Guide

Production deployment guide for frontend & backend.

## Architecture (production)

```
Vercel (React)  →  Render (Express API)  →  Neon Postgres
                         ↓
                   Razorpay Test webhooks (public HTTPS)
                   Gemini API
```

## 1. Backend on Render

1. Push repo to GitHub.
2. [Render](https://render.com) → **New → Blueprint** (uses root `render.yaml`)  
   or **Web Service** with:
   - Root directory: `backend`
   - Build: `npm ci && npx prisma generate && npm run build`
   - Start: `npm start`
3. Set env vars (same as `.env.example`):

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Neon connection string |
| `RAZORPAY_KEY_ID` / `KEY_SECRET` / `WEBHOOK_SECRET` | Test Mode |
| `LLM_API_KEY` | Gemini |
| `LLM_MODEL` | `gemini-3.6-flash` |
| `FRONTEND_URL` | Your Vercel URL (CORS) |
| `NODE_ENV` | `production` |
| `PORT` | Render sets this; keep health on `/health` |

4. After deploy, note API URL: `https://razorrecover-api.onrender.com`

5. Razorpay Dashboard → Webhooks (Test Mode):

```text
https://YOUR_RENDER_URL/webhooks/razorpay
```

Events: `payment.failed`, `payment.captured`

> Free Render may cold-start (~30–60s). Hit `/health` before demos.

## 2. Frontend on Vercel

1. [Vercel](https://vercel.com) → Import repo
2. Root directory: `frontend`
3. Env:

```env
VITE_API_URL=https://YOUR_RENDER_URL
```

4. Deploy. Open the Vercel URL — dashboard should load live metrics from Render.

## 3. Post-deploy smoke test

1. `GET https://API/health` → `ok: true`, `llm.configured: true`
2. Open dashboard → **Full recovery** demo button  
   → case ends `RECOVERED`, Recovered ₹ increases  
   (uses real capture verifier path with demo payload)
3. **Escalate** / **Reject** still show policy gates
4. Optional: real Razorpay Test payment fail via webhook URL

## 4. Secrets checklist

- Never commit `.env`
- Rotate any keys that were pasted in chat / screenshots
- Use Test Mode API keys for sandbox verification

## 5. 5-minute pitch

Use [demo-script.md](./demo-script.md) against the **deployed** URL (not localhost) when possible.
