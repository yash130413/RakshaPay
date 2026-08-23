import { Router } from "express";
import { prisma } from "../db.js";

export const analyticsRouter = Router();

analyticsRouter.get("/summary", async (_req, res) => {
  const [atRiskAgg, recoveredAgg, cases, actions] = await Promise.all([
    prisma.recoveryCase.aggregate({
      _sum: { amount: true },
      where: {
        status: {
          notIn: ["RECOVERED", "REJECTED"],
        },
      },
    }),
    prisma.recoveryCase.aggregate({
      _sum: { recoveredAmount: true },
      where: { status: "RECOVERED" },
    }),
    prisma.recoveryCase.count(),
    prisma.recoveryAction.groupBy({
      by: ["actionType"],
      _count: true,
    }),
  ]);

  const atRiskPaise = atRiskAgg._sum.amount ?? 0;
  const recoveredPaise = recoveredAgg._sum.recoveredAmount ?? 0;
  const recoveryRate =
    atRiskPaise + recoveredPaise > 0
      ? recoveredPaise / (atRiskPaise + recoveredPaise)
      : 0;

  res.json({
    revenueAtRisk: atRiskPaise / 100,
    recovered: recoveredPaise / 100,
    recoveryRate,
    totalCases: cases,
    actions: actions.map((a) => ({
      actionType: a.actionType,
      count: a._count,
    })),
  });
});
