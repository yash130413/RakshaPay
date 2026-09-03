import crypto from "node:crypto";
import Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID ?? "";
const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";

export const razorpayClient =
  keyId && keySecret
    ? new Razorpay({ key_id: keyId, key_secret: keySecret })
    : null;

/**
 * Adapter so the rest of the app never depends on Razorpay SDK details.
 * Day 1: stubs + webhook verify. Day 2+: real test-mode calls.
 */
export class RazorpayService {
  static verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
    if (!secret) {
      console.warn("RAZORPAY_WEBHOOK_SECRET missing — rejecting webhook");
      return false;
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature)
      );
    } catch {
      return false;
    }
  }

  static async getPayment(paymentId: string) {
    if (!razorpayClient) throw new Error("Razorpay not configured");
    return razorpayClient.payments.fetch(paymentId);
  }

  static async createPaymentLink(params: {
    amount: number;
    currency?: string;
    description: string;
    customer?: { name?: string; email?: string; contact?: string };
    notes?: Record<string, string>;
    referenceId?: string;
  }): Promise<{ id: string; short_url?: string }> {
    if (!razorpayClient) throw new Error("Razorpay not configured");

    const notifyCustomer = process.env.RAZORPAY_NOTIFY_CUSTOMER === "true" || process.env.RAZORPAY_NOTIFY_CUSTOMER === "1";

    const payload: Record<string, unknown> = {
      amount: params.amount,
      currency: params.currency ?? "INR",
      description: params.description,
      notes: params.notes,
      reference_id: params.referenceId,
      notify: {
        sms: notifyCustomer,
        email: notifyCustomer,
        whatsapp: notifyCustomer,
      },
    };

    if (params.customer?.name || params.customer?.email || params.customer?.contact) {
      payload.customer = {
        ...(params.customer.name ? { name: params.customer.name } : {}),
        ...(params.customer.email ? { email: params.customer.email } : {}),
        ...(params.customer.contact ? { contact: params.customer.contact } : {}),
      };
    }

    const link = (await razorpayClient.paymentLink.create(
      payload as never
    )) as { id: string; short_url?: string };

    return link;
  }

  static async getSubscription(subscriptionId: string) {
    if (!razorpayClient) throw new Error("Razorpay not configured");
    return razorpayClient.subscriptions.fetch(subscriptionId);
  }
}
