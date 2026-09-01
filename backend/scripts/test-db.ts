import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$connect();
  const count = await prisma.recoveryCase.count();
  console.log(`DB OK — recovery cases: ${count}`);
} catch (e) {
  const err = e as { code?: string; message?: string };
  console.error("DB FAIL:", err.code ?? "unknown", err.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
