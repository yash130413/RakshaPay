# RazorRecover — 5-Minute Demo Script

**Audience:** Razorpay AI internship judges / engineers  
**Goal:** Prove one closed-loop financial recovery agent — not a chatbot demo.

---

## Positioning (15 seconds)

> “RazorRecover is an AI revenue recovery agent for merchants.  
> When a Razorpay payment fails, Gemini diagnoses and recommends an action.  
> A **policy engine** gates every action. Razorpay Test Mode executes.  
> Webhooks verify. The dashboard proves rupees recovered.  
> **AI decides. Policy controls. Razorpay executes. Webhooks verify.**”

---

## Pre-demo checklist

| Check | How |
|--------|-----|
| Backend live | `http://localhost:4000/health` → `ok: true`, `llm.configured: true` |
| Frontend live | `http://localhost:5173` |
| Neon DB | Cases API returns JSON |
| Razorpay Test keys | Execute creates `plink_*` |
| Gemini | New failure shows `diagnosis_gemini` / `strategy_gemini` |
| Optional ngrok | Only if showing live Razorpay Dashboard webhooks |

Have ready:

- Dashboard URL
- One browser tab on `/api/recovery/cases/:id` (or Network tab)
- PowerShell / script for a signed `payment.failed` webhook **or** a prepared Test payment link fail path

---

## Minute-by-minute script

### 0:00–0:40 — Dashboard (merchant pain)

1. Open dashboard.
2. Point to metrics:
   - **At Risk** — failed revenue stuck in pipeline
   - **Recovered** — money confirmed back
   - **Recovery Rate** — recovered / (at risk + recovered)
   - **Cases** — workflow instances
3. Say: “This is what a merchant ops team would watch.”

### 0:40–1:20 — Trigger failure

1. Fire a signed webhook (or Razorpay Test fail):

   - Amount example: **₹3,499** (`349900` paise)
   - Reason: `insufficient funds` or `card expired`

2. Show dashboard refresh (5s poll) — new case appears, status moves toward `WAITING_FOR_WEBHOOK`.

**Talking point:** “We don’t poll Razorpay. We react to webhooks — production payment architecture.”

### 1:20–2:20 — AI decision (Gemini)

1. Open case detail API or show diagnosis on UI:

   - `agent: diagnosis_gemini`
   - `agent: strategy_gemini`
   - Structured fields: diagnosis, confidence, `recommendedAction`, probability

2. Emphasize:

   - Output is **JSON**, not free text
   - Action is from a **whitelist enum**
   - If Gemini times out / fails → **rules fallback** (system stays available)

**Talking point:** “Bounded agents. Zod validation. Fail closed to rules — never fail open to money movement.”

### 2:20–3:00 — Policy gate

1. Show audit: `policy.approved` (or escalate/reject on a high-amount demo).
2. Explain defaults:

   - Max recovery amount ₹50,000
   - Human review above ₹25,000
   - Max retries = 2

**Talking point:** “The model cannot bypass merchant policy. That’s the internship-relevant safety story.”

### 3:00–3:40 — Razorpay execution

1. Show `RecoveryAction`:

   - `status: executed`
   - `razorpayRefId: plink_...`
   - `shortUrl: https://rzp.io/...`

2. Optional: open the Test Mode payment link.

**Talking point:** “This is a real Razorpay Test API call — not a mocked `setTimeout` success.”

### 3:40–4:20 — Verify recovery

**Path A (preferred live):** Customer pays on Test link → `payment.captured` webhook → status `RECOVERED`, Recovered ₹ increases.

**Path B (reliable offline):**  
`POST /api/recovery/cases/:id/simulate-capture` → same metric update for demo continuity.

Show:

- Case badge **RECOVERED**
- Audit `recovery.confirmed`
- Dashboard **Recovered** and **Recovery Rate** update

### 4:20–4:50 — Audit trail + failure path

1. Scroll audits:

   ```
   payment.failed → risk.detected → diagnosis.completed
   → recovery.recommended → policy.approved → recovery.executed
   → recovery.confirmed
   ```

2. **Deliberate failure / safety (10–20s):**

   - Mention high amount → `ESCALATED` / `REJECTED`
   - Or max retries → human escalation / stop
   - “Stopping rules matter as much as recovery rate.”

### 4:50–5:00 — Close

> “One loop: detect, diagnose, decide, gate, execute, verify, measure.  
> Stack: Express, Prisma, Neon, Razorpay Test, Gemini Flash, bounded state machine.  
> Happy to walk through the policy engine or webhook idempotency next.”

---

## Backup demos (if live webhook flaky)

| Problem | Backup |
|---------|--------|
| ngrok / Razorpay delay | Signed local webhook to `localhost:4000` |
| Gemini slow | Show previous case with `*_gemini` in DB; mention 30s timeout + fallback |
| Payment link pay awkward | `simulate-capture` then explain real capture path in code |
| Empty dashboard | Pre-seed one recovered case before judges arrive |

---

## Questions you should be ready for

| Question | Answer direction |
|----------|------------------|
| Why not let the LLM call Razorpay tools directly? | Financial blast radius; policy must be deterministic and auditable |
| Why Gemini? | Free tier, JSON mode, fast enough; provider-swappable behind `llm.client` |
| How do you prevent duplicate recoveries? | Webhook `eventId` uniqueness + case state machine |
| How do you know money was recovered? | `payment.captured` webhook → verifier → `recoveredAmount` |
| What’s next? | Evaluation harness (baseline vs agent), richer customer history context, deploy |

---

## Demo anti-patterns (avoid)

- Spending time on UI polish over the money loop
- Claiming live Mode settlements
- Hiding that Test Mode / simulate-capture was used — be honest, then show real `plink_*` creation
- Showing only LLM chat without policy / webhook / audit
