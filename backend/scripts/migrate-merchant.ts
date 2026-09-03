import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();
  console.log("Connected to Database.");

  // Check existing merchants
  const merchants = await prisma.merchant.findMany({
    include: {
      _count: {
        select: {
          recoveryCases: true,
          customers: true,
          payments: true,
          policies: true,
        },
      },
    },
  });

  console.log("Current Merchants in DB:", JSON.stringify(merchants, null, 2));

  // 1. Create or ensure new merchant: yashrohilla1204@gmail.com
  const newMerchant = await prisma.merchant.upsert({
    where: { email: "yashrohilla1204@gmail.com" },
    update: {
      name: "Yash Rohilla",
    },
    create: {
      name: "Yash Rohilla",
      email: "yashrohilla1204@gmail.com",
      policies: {
        create: {
          name: "default",
          maxRetries: 2,
          maxRecoveryAmount: 50000,
          allowPaymentLink: true,
          requireHumanAbove: 25000,
        },
      },
    },
  });
  console.log(`Target Merchant ready: ${newMerchant.id} (${newMerchant.email})`);

  // Find demo merchant(s) to migrate from
  const demoMerchants = await prisma.merchant.findMany({
    where: {
      id: { not: newMerchant.id },
    },
  });

  for (const dm of demoMerchants) {
    console.log(`Migrating data from old merchant: ${dm.id} (${dm.email})...`);

    // Migrate Customers
    const customersUpdated = await prisma.customer.updateMany({
      where: { merchantId: dm.id },
      data: { merchantId: newMerchant.id },
    });
    console.log(`Migrated ${customersUpdated.count} customers.`);

    // Migrate Payments
    const paymentsUpdated = await prisma.payment.updateMany({
      where: { merchantId: dm.id },
      data: { merchantId: newMerchant.id },
    });
    console.log(`Migrated ${paymentsUpdated.count} payments.`);

    // Migrate Recovery Cases
    const casesUpdated = await prisma.recoveryCase.updateMany({
      where: { merchantId: dm.id },
      data: { merchantId: newMerchant.id },
    });
    console.log(`Migrated ${casesUpdated.count} recovery cases.`);

    // Delete policies of old merchant
    await prisma.policy.deleteMany({
      where: { merchantId: dm.id },
    });

    // Delete old merchant
    await prisma.merchant.delete({
      where: { id: dm.id },
    });
    console.log(`Deleted old merchant account: ${dm.email}`);
  }

  const finalCases = await prisma.recoveryCase.count({
    where: { merchantId: newMerchant.id },
  });
  console.log(`Total recovery cases now linked to ${newMerchant.email}: ${finalCases}`);
}

main()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
