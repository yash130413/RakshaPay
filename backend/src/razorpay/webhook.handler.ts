import { Router } from "express";
import { prisma } from "../db.js";
import { writeAudit } from "../audit/audit.service.js";
import { RazorpayService } from "./razorpay.service.js";
import { startRecoveryWorkflow } from "../workflows/recovery.workflow.js";

export const webhookRouter = Router();

webhookRouter.post("/", async (req, res) => {
  try {
    const signature = req.header("x-razorpay-signature") ?? "";
    const rawBody = req.body as Buffer;

    if (!RazorpayService.verifyWebhookSignature(rawBody, signature)) {
      await writeAudit({
        eventType: "webhook.rejected",
        message: "Invalid Razorpay webhook signature",
      });
      return res.status(400).json({ error: "Invalid signature" });
    }

    const payload = JSON.parse(rawBody.toString("utf8")) as {
      event?: string;
      id?: string;
      payload?: Record<string, unknown>;
    };

    const eventType = payload.event ?? "unknown";
    const eventId = payload.id ?? null;

    // Idempotency: skip duplicate event ids
    if (eventId) {
      const existing = await prisma.webhookEvent.findUnique({
        where: { eventId },
      });
      if (existing) {
        return res.status(200).json({ ok: true, duplicate: true });
      }
    }

    const stored = await prisma.webhookEvent.create({
      data: {
        eventId: eventId ?? undefined,
        eventType,
        payload: payload as object,
      },
    });

    await writeAudit({
      eventType: "webhook.received",
      message: `Received ${eventType}`,
      metadata: { webhookEventId: stored.id, eventType },
    });

    if (eventType === "payment.failed" || eventType === "payment.captured") {
      await startRecoveryWorkflow({ webhookEventId: stored.id, payload });
    }

    await prisma.webhookEvent.update({
      where: { id: stored.id },
      data: { processed: true, processedAt: new Date() },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});
