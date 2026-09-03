# RakshaPay — 5-Minute Demo Script

**Goal:** Prove one closed-loop financial recovery agent — not a chatbot demo.  
**Prefer:** Deployed Vercel + Render URLs ([deploy.md](./deploy.md)). Localhost is fine if cold-start is an issue.

---

## Positioning (15 seconds)

> “RakshaPay is an AI revenue recovery platform for merchants.  
> When a payment fails, AI diagnoses and recommends an action.  
> A **policy engine** gates every action. Razorpay executes.  
> Webhooks verify. The dashboard proves rupees recovered.  
> **AI decides. Policy controls. Razorpay executes. Webhooks verify.**”

---

## Pre-demo checklist

| Check | How |
|--------|-----|
| API healthy | `/health` → `ok: true`, `llm.configured: true` |
| Dashboard open | Vercel or `localhost:5173` |
| Neon reachable | Cases/metrics load |
| Demo buttons visible | Full recovery / Escalate / Reject |

---

## Minute-by-minute script

### 0:00–0:40 — Dashboard

Show live KPIs + held-out **evaluation strip** (49.3% → 68.6% recovery, fewer retries).  
“This is measured, not vibes.”

### 0:40–1:40 — Full money loop (one click)

Click **Full recovery (fail → ₹ back)**.

Walk the case detail / audit:

1. `payment.failed`
2. Gemini (or rules) diagnosis + strategy  
3. `policy.approved`
4. Razorpay action / waiting
5. `payment.captured` verifier → **RECOVERED**
6. Recovered ₹ and chart update

**Talking point:** “Same verifier path as a real Razorpay capture webhook — demo payload, production control flow.”

### 1:40–2:30 — Policy gates

Click **Escalate ₹30,000** → `ESCALATED` (human threshold).  
Click **Reject ₹60,000** → `REJECTED` (max recovery).  

“The model cannot bypass merchant policy.”

### 2:30–3:20 — Agents + audit

Open case detail: `diagnosis_gemini` / `strategy_gemini` (or rules fallback).  
Scroll global Audit Trail timestamps.

### 3:20–4:10 — Real Razorpay story (optional if time)

Show a case with `plink_*` / short URL from Test Mode execution, or explain ngrok/Render webhook URL for live `payment.failed` from Razorpay Dashboard.

### 4:10–4:50 — Eval + stopping rules

Point at evaluation strip again + unnecessary retries **0** vs baseline **1009**.  
Mention max retries / amount caps.

### 4:50–5:00 — Close

> “One loop: detect, diagnose, decide, gate, execute, verify, measure.  
> Happy to walk through webhook idempotency or the policy engine next.”

---

## Backup

| Problem | Backup |
|---------|--------|
| Gemini timeout | Rules fallback still demos the loop |
| Razorpay link create fails | Full recovery / escalate / reject still prove AI + policy + verify |
| Render cold start | Hit `/health` first; or localhost |

---

## Honesty notes (say if asked)

- Demo triggers skip Razorpay signature so judges aren’t blocked by ngrok mid-pitch.  
- Production path still verifies HMAC on `/webhooks/razorpay`.  
- Evaluation is offline held-out simulation mirroring backend rules + policy.  
- Razorpay test mode / sandbox environment is used for verification.
