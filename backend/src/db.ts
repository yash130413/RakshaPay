import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function connectDatabaseWithRetry(
  maxAttempts = 5,
  delayMs = 3000
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect();
      console.log("Database connected");
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
      console.warn(`Database connect attempt ${attempt}/${maxAttempts} failed: ${message}`);
      if (attempt === maxAttempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
