import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export async function writeAudit(params: {
  recoveryCaseId?: string;
  eventType: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({
    data: {
      recoveryCaseId: params.recoveryCaseId,
      eventType: params.eventType,
      message: params.message,
      metadata: params.metadata ?? undefined,
    },
  });
}
