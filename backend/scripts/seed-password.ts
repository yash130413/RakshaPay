import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/auth.utils.js";

const prisma = new PrismaClient();

async function seedUser() {
  await prisma.$connect();
  console.log("Seeding password for Yash Rohilla in Neon DB...");

  const hash = hashPassword("10122004");

  const merchant = await prisma.merchant.upsert({
    where: { email: "yashrohilla1204@gmail.com" },
    update: {
      passwordHash: hash,
      name: "Yash Rohilla",
    },
    create: {
      email: "yashrohilla1204@gmail.com",
      name: "Yash Rohilla",
      passwordHash: hash,
    },
  });

  console.log("Updated Merchant in DB with Password Hash:", {
    id: merchant.id,
    email: merchant.email,
    name: merchant.name,
    hasPasswordHash: Boolean(merchant.passwordHash),
  });
}

seedUser()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
