# RazorRecover — API Reference

Base URL (local): `http://localhost:4000`

All JSON responses use `Content-Type: application/json` unless noted.

---

## Health

### `GET /health`

Liveness + LLM configuration status.

**Response**

```json
{
  "ok": true,
  "service": "razorrecover-backend",
  "principle": "AI decides. Policy controls. Razorpay executes. Webhooks verify.",
  "llm": {
    "provider": "gemini",
    "model": "gemini-3.6-flash",
    "configured": true
  }
}
```

| Field | Meaning |
|--------|---------|
| `llm.configured` | `LLM_API_KEY` (or `GEMINI_API_KEY`) is present |
| `llm.model` | From `LLM_MODEL` env or default |

---

## Webhooks

### `POST /webhooks/razorpay`

Razorpay webhook receiver. Body must be **raw JSON** (not re-serialized) for signature verification.

**Headers**

| Header | Required |
|--------|----------|
| `Content-Type` | `application/json` |
| `x-razorpay-signature` | HMAC-SHA256 hex of raw body using webhook secret |

**Handled events**

| Event | Behaviour |
|--------|-----------|
| `payment.failed` | Start recovery workflow |
| `payment.captured` | Verify recovery → `RECOVERED` when matched |

**Success**

```json
{ "ok": true }
```

**Duplicate event id**

```json
{ "ok": true, "duplicate": true }
```

**Invalid signature**

```json
{ "error": "Invalid signature" }
```
Status `400`.

#### Local signed test (PowerShell)

```powershell
$secret = $env:RAZORPAY_WEBHOOK_SECRET  # or paste from .env
$body = '{"event":"payment.failed","id":"evt_demo_1","payload":{"payment":{"entity":{"id":"pay_demo_1","amount":349900,"currency":"INR","status":"failed","method":"card","error_reason":"insufficient funds"}}}}'
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
$sig = [BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))).Replace("-","").ToLower()

Invoke-RestMethod -Uri "http://localhost:4000/webhooks/razorpay" `
  -Method POST -Body $body -ContentType "application/json" `
  -Headers @{ "x-razorpay-signature" = $sig }
```

**Note:** Each test must use a **new** `event.id` and preferably a new `payment.id` (idempotency + unique payment ids).

---

## Analytics

### `GET /api/analytics/summary`

Dashboard KPIs.

**Response**

```json
{
  "revenueAtRisk": 7999,
  "recovered": 1000,
  "recoveryRate": 0.111,
  "totalCases": 8,
  "actions": [
    { "actionType": "PAYMENT_LINK", "count": 9 }
  ]
}
```

| Field | Unit | Definition |
|--------|------|------------|
| `revenueAtRisk` | INR | Sum of case amounts where status ∉ {`RECOVERED`, `REJECTED`} |
| `recovered` | INR | Sum of `recoveredAmount` on `RECOVERED` cases |
| `recoveryRate` | 0–1 | `recovered / (atRisk + recovered)` (paise-based) |
| `totalCases` | count | All recovery cases |
| `actions` | list | `groupBy` on `RecoveryAction.actionType` |

---

## Recovery

### `GET /api/recovery/cases`

Latest 50 cases (newest first), including `actions` and truncated `audits`.

### `GET /api/recovery/cases/:id`

Full case: `decisions`, `actions`, `results`, full `audits`.

**Useful fields on a case**

| Field | Description |
|--------|-------------|
| `status` | State machine status |
| `amount` | Paise |
| `diagnosis` / `diagnosisConfidence` | From diagnosis agent |
| `recommendedAction` | Enum action |
| `expectedRecoveryProbability` | 0–1 |
| `recoveredAmount` | Paise recovered |
| `decisions[].agent` | e.g. `diagnosis_gemini`, `strategy_rules` |
| `decisions[].rawJson` | Full agent payload including `source` |
| `actions[].razorpayRefId` | e.g. `plink_...` |
| `actions[].metadata.shortUrl` | Customer-facing link |

**Gemini success signal**

```json
"decisions": [
  { "agent": "diagnosis_gemini", "rawJson": { "source": "gemini", "...": "..." } },
  { "agent": "strategy_gemini", "rawJson": { "source": "gemini", "...": "..." } }
]
```

### `POST /api/recovery/cases/:id/execute`

Re-executes Razorpay recovery for a case (useful for Day-1 `queued` rows or retries).

**Response (shape)**

```json
{
  "ok": true,
  "action": { "id": "...", "status": "executed", "razorpayRefId": "plink_..." },
  "execution": {
    "ok": true,
    "status": "executed",
    "shortUrl": "https://rzp.io/...",
    "message": "Created Razorpay payment link ..."
  }
}
```

`ok: false` → Razorpay error; check `execution.message` and server logs.

### `POST /api/recovery/cases/:id/simulate-capture`

**Dev helper.** Marks case `RECOVERED` without a live `payment.captured` webhook.

```json
{ "ok": true, "recoveredAmount": 1000 }
```

Use for demos when ngrok/payment UX is inconvenient. Prefer real capture for the “production story.”

### `GET /api/recovery/audit`

Latest 100 audit log rows (global).

---

## Error conventions

| Status | Typical cause |
|--------|----------------|
| `400` | Invalid webhook signature; execute on already recovered case |
| `404` | Unknown case id |
| `500` | Unhandled webhook / DB / Razorpay failure |

---

## CORS

Configured for `FRONTEND_URL` (default `http://localhost:5173`).
