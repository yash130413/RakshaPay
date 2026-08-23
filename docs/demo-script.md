# 5-minute demo script

1. Open dashboard: "This merchant has ₹X stuck in failed payments."
2. Trigger / show webhook: `payment.failed` ₹24,999 Customer C1029
3. AI diagnosis: expired method, high-value, ~81% recovery probability
4. Recommend: payment method update / payment link
5. Policy: allowed, within limits, retries OK
6. Razorpay test API executes
7. Webhook `payment.captured` → ₹24,999 RECOVERED
8. Audit trail timestamps
9. Deliberate failure path: retries → STOP → human escalation
