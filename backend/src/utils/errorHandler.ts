import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";

function isPrismaConnectionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P1000", "P1001", "P1002", "P1008", "P1017"].includes(err.code);
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  return false;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (isPrismaConnectionError(err)) {
    const message =
      err instanceof Error ? err.message.split("\n")[0] : "Database unreachable";
    console.error("[db]", message);
    return res.status(503).json({
      error: "Database temporarily unavailable. Retry in a few seconds (Neon may be waking up).",
      code: err instanceof Prisma.PrismaClientKnownRequestError ? err.code : "DB_UNAVAILABLE",
    });
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  console.error(err);
  return res.status(500).json({ error: message });
}
