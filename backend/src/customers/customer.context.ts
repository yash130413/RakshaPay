import { prisma } from "../db.js";

export type CustomerContext = {
  customerId: string;
  successfulPayments: number;
  avgAmountInr: number;
  isLoyalCustomer: boolean;
};

const LOYAL_DEMO_EMAIL = "loyal.subscriber@demo.local";
const LOYAL_DEMO_SUCCESS_COUNT = 8;

/**
 * Resolve or create a merchant customer and return payment-history stats for AI agents.
 */
export async function resolveCustomerContext(params: {
  merchantId: string;
  email?: string | null;
  contact?: string | null;
  name?: string | null;
}): Promise<CustomerContext | null> {
  const email = params.email?.trim().toLowerCase() || null;
  const contact = params.contact?.trim() || null;

  if (!email && !contact) {
    return null;
  }

  let customer = email
    ? await prisma.customer.findFirst({
        where: { merchantId: params.merchantId, email },
      })
    : await prisma.customer.findFirst({
        where: { merchantId: params.merchantId, phone: contact ?? undefined },
      });

  if (!customer) {
    const seedSuccess =
      email === LOYAL_DEMO_EMAIL ? LOYAL_DEMO_SUCCESS_COUNT : 0;
    customer = await prisma.customer.create({
      data: {
        merchantId: params.merchantId,
        email: email ?? undefined,
        phone: contact ?? undefined,
        name: params.name ?? (email === LOYAL_DEMO_EMAIL ? "Loyal Subscriber" : undefined),
        successfulPayments: seedSuccess,
        avgAmount: email === LOYAL_DEMO_EMAIL ? 99900 : 0,
      },
    });
  } else if (email === LOYAL_DEMO_EMAIL && customer.successfulPayments < LOYAL_DEMO_SUCCESS_COUNT) {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        successfulPayments: LOYAL_DEMO_SUCCESS_COUNT,
        avgAmount: customer.avgAmount || 99900,
        name: customer.name ?? "Loyal Subscriber",
      },
    });
  }

  const capturedCount = await prisma.payment.count({
    where: {
      customerId: customer.id,
      status: "captured",
    },
  });

  const successfulPayments = Math.max(customer.successfulPayments, capturedCount);
  const avgAmountInr = Math.round(
    (customer.avgAmount > 0 ? customer.avgAmount : amountPaiseFallback(customer)) / 100
  );

  return {
    customerId: customer.id,
    successfulPayments,
    avgAmountInr,
    isLoyalCustomer: successfulPayments >= 3,
  };
}

function amountPaiseFallback(customer: { avgAmount: number }) {
  return customer.avgAmount > 0 ? customer.avgAmount : 99900;
}

/** Bump customer stats after a verified recovery capture. */
export async function recordCustomerRecovery(params: {
  customerId: string;
  recoveredAmountPaise: number;
}) {
  const customer = await prisma.customer.findUnique({
    where: { id: params.customerId },
  });
  if (!customer) return;

  const nextCount = customer.successfulPayments + 1;
  const nextAvg =
    customer.successfulPayments > 0
      ? Math.round(
          (customer.avgAmount * customer.successfulPayments + params.recoveredAmountPaise) /
            nextCount
        )
      : params.recoveredAmountPaise;

  await prisma.customer.update({
    where: { id: params.customerId },
    data: {
      successfulPayments: nextCount,
      avgAmount: nextAvg,
    },
  });
}

export { LOYAL_DEMO_EMAIL };
