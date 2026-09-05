import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const policyRouter = Router();

const DEFAULT_POLICY = {
  name: "default",
  maxRetries: 2,
  retryScheduleDays: "1,3,7",
  maxRecoveryAmount: 50000,
  allowPaymentLink: true,
  requireHumanAbove: 25000,
  maxInvoiceReminders: 3,
  notifyCustomerSms: true,
  notifyCustomerEmail: true,
  active: true,
} as const;

function serializePolicy(policy: {
  id: string;
  merchantId: string;
  name: string;
  maxRetries: number;
  retryScheduleDays: string;
  maxRecoveryAmount: number;
  allowPaymentLink: boolean;
  requireHumanAbove: number;
  maxInvoiceReminders: number;
  notifyCustomerSms: boolean;
  notifyCustomerEmail: boolean;
  active: boolean;
  updatedAt: Date;
}) {
  return {
    id: policy.id,
    merchantId: policy.merchantId,
    name: policy.name,
    maxRetries: policy.maxRetries,
    retryScheduleDays: policy.retryScheduleDays ?? "1,3,7",
    maxRecoveryAmount: policy.maxRecoveryAmount,
    allowPaymentLink: policy.allowPaymentLink,
    requireHumanAbove: policy.requireHumanAbove,
    maxInvoiceReminders: policy.maxInvoiceReminders ?? 3,
    notifyCustomerSms: policy.notifyCustomerSms,
    notifyCustomerEmail: policy.notifyCustomerEmail,
    active: policy.active,
    updatedAt: policy.updatedAt.toISOString(),
  };
}

async function resolveMerchantWithPolicy(merchantId?: string | null) {
  if (merchantId) {
    const byId = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { policies: { where: { active: true }, orderBy: { updatedAt: "desc" }, take: 1 } },
    });
    if (byId) return byId;
  }

  const email = (process.env.MERCHANT_EMAIL ?? "demo@rakshapay.com").trim().toLowerCase();
  const name = process.env.MERCHANT_NAME ?? "Demo Merchant";

  return prisma.merchant.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      policies: { create: { ...DEFAULT_POLICY } },
    },
    include: { policies: { where: { active: true }, orderBy: { updatedAt: "desc" }, take: 1 } },
  });
}

async function ensureActivePolicy(merchantId: string) {
  const existing = await prisma.policy.findFirst({
    where: { merchantId, active: true },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  return prisma.policy.create({
    data: { merchantId, ...DEFAULT_POLICY },
  });
}

policyRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const merchantId =
      typeof req.query.merchantId === "string" ? req.query.merchantId.trim() : undefined;
    const merchant = await resolveMerchantWithPolicy(merchantId);
    const policy = merchant.policies[0] ?? (await ensureActivePolicy(merchant.id));
    return res.json(serializePolicy(policy));
  })
);

policyRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const merchantId =
      typeof body.merchantId === "string" && body.merchantId.trim()
        ? body.merchantId.trim()
        : undefined;

    const maxRetries = Number(body.maxRetries);
    const maxRecoveryAmount = Number(body.maxRecoveryAmount);
    const requireHumanAbove = Number(body.requireHumanAbove);
    const allowPaymentLink = Boolean(body.allowPaymentLink);
    const notifyCustomerSms = Boolean(body.notifyCustomerSms);
    const notifyCustomerEmail = Boolean(body.notifyCustomerEmail);
    const retryScheduleDays =
      typeof body.retryScheduleDays === "string" && body.retryScheduleDays.trim()
        ? body.retryScheduleDays
            .split(",")
            .map((s: string) => Number(s.trim()))
            .filter((n: number) => Number.isFinite(n) && n >= 0)
            .join(",") || "1,3,7"
        : "1,3,7";
    const maxInvoiceReminders = Number(body.maxInvoiceReminders ?? 3);

    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
      return res.status(400).json({ error: "maxRetries must be an integer between 0 and 10" });
    }
    if (!Number.isInteger(maxRecoveryAmount) || maxRecoveryAmount < 1000) {
      return res.status(400).json({ error: "maxRecoveryAmount must be an integer ≥ 1000" });
    }
    if (!Number.isInteger(requireHumanAbove) || requireHumanAbove < 0) {
      return res.status(400).json({ error: "requireHumanAbove must be a non-negative integer" });
    }
    if (requireHumanAbove >= maxRecoveryAmount) {
      return res.status(400).json({
        error: "requireHumanAbove must be lower than maxRecoveryAmount",
      });
    }
    if (!Number.isInteger(maxInvoiceReminders) || maxInvoiceReminders < 1 || maxInvoiceReminders > 10) {
      return res.status(400).json({ error: "maxInvoiceReminders must be 1–10" });
    }

    const merchant = await resolveMerchantWithPolicy(merchantId);
    const existing = merchant.policies[0] ?? (await ensureActivePolicy(merchant.id));

    const updated = await prisma.policy.update({
      where: { id: existing.id },
      data: {
        maxRetries,
        maxRecoveryAmount,
        requireHumanAbove,
        allowPaymentLink,
        notifyCustomerSms,
        notifyCustomerEmail,
        retryScheduleDays,
        maxInvoiceReminders,
      },
    });

    return res.json(serializePolicy(updated));
  })
);
