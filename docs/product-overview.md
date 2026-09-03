# RakshaPay — Product Overview

**Category:** AI-powered revenue recovery platform for merchants  
**Focus:** Autonomous payment recovery & revenue protection

---

## Problem

Merchants lose revenue when payments fail:

- Cards expire, funds are temporarily insufficient, international cards are blocked, auth fails
- Ops teams retry manually or send generic payment links
- Blind retries waste gateway attempts and annoy customers
- There is no closed loop from **failure → intelligent action → verified recovery → measured ₹**

The key breakthrough is **agents + payments + webhooks + policy + audit**.

---

## Solution

**RakshaPay** is an autonomous (bounded) revenue recovery agent:

1. Listens to Razorpay **`payment.failed`** webhooks  
2. Detects revenue at risk  
3. Uses **Gemini** to diagnose and recommend a recovery action (structured JSON)  
4. Runs recommendations through a **merchant policy engine**  
5. Executes via **Razorpay Test Mode** (payment links)  
6. Confirms success on **`payment.captured`**  
7. Surfaces **At Risk / Recovered / Rate** on a live merchant dashboard  
8. Keeps a full **audit trail** for every step  

---

## Value proposition

| Stakeholder | Value |
|-------------|--------|
| Merchant | Higher recovery rate, fewer blind retries, clear ₹ recovered |
| Ops / risk | Policy limits, escalation thresholds, stop rules |
| Razorpay ecosystem | Deeper use of payments + webhooks + Test Mode realism |
| Judges | Production-shaped agent design, not a toy chatbot |

---

## Core differentiators

1. **Bounded AI** — Gemini recommends; never executes money moves directly  
2. **Policy as authority** — Hard TypeScript gates (amount, retries, human threshold)  
3. **Real Razorpay Test integration** — Signature-verified webhooks + `paymentLink.create`  
4. **Verifiable outcomes** — Recovery only counted after capture (or explicit simulate in dev)  
5. **Explainability** — `AIDecision.rawJson` + append-only `AuditLog`  
6. **Resilience** — LLM timeout / API failure → deterministic rules fallback  

---

## Recovery actions (MVP)

| Action | When (typical) | Execution in MVP |
|--------|----------------|------------------|
| `RETRY_PAYMENT` | Temporary failure, low attempts | Payment link (retry UX) |
| `PAYMENT_LINK` | Method issues, general recovery | Razorpay Payment Link |
| `METHOD_UPDATE` | Expired / invalid method | Payment Link with update framing |
| `WAIT` | Defer | No API call |
| `HUMAN_ESCALATION` | High value / exhausted options | No auto money move |
| `STOP` | Unrecoverable | Stop |

---

## Success metrics (product)

| Metric | Definition |
|--------|------------|
| Revenue at risk | Sum of amounts on non-recovered open cases |
| Revenue recovered | Sum of `recoveredAmount` on `RECOVERED` cases |
| Recovery rate | Recovered / (at risk + recovered) |
| Unnecessary retries | Retries that policy should have stopped (eval target) |
| Human escalation rate | Share of cases escalated |
| Agent source mix | `%` Gemini vs rules (ops health) |

Evaluation scripts under `evaluation/` will compare **baseline (blind retry)** vs **RazorRecover** on a synthetic held-out set (Day 7 target).

---

## Non-goals (honest scope)

- Live Mode real production settlement without merchant consent  
- Full subscription dunning suite (can be roadmap)  
- Multi-tenant SaaS auth / billing  
- Unrestricted multi-agent tool use without policy  

---

## One-sentence pitch

> RazorRecover turns Razorpay payment failures into policy-gated, AI-recommended recovery actions — executed in Test Mode, verified by webhooks, and proven on a merchant dashboard in rupees recovered.
