import { Router } from "express";
import { prisma } from "../db.js";
import { EVAL_SNAPSHOT } from "./eval.snapshot.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const analyticsRouter = Router();

analyticsRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
  const [atRiskAgg, recoveredAgg, cases, actions, escalated, rejected, recovered] =
    await Promise.all([
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
      prisma.recoveryCase.count({ where: { status: "ESCALATED" } }),
      prisma.recoveryCase.count({ where: { status: "REJECTED" } }),
      prisma.recoveryCase.count({ where: { status: "RECOVERED" } }),
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
    escalatedCases: escalated,
    rejectedCases: rejected,
    recoveredCases: recovered,
    actions: actions.map((a) => ({
      actionType: a.actionType,
      count: a._count,
    })),
  });
  })
);

/**
 * Time series for dashboard chart — daily failed (at-risk inflow) vs recovered.
 */
analyticsRouter.get(
  "/series",
  asyncHandler(async (_req, res) => {
  const cases = await prisma.recoveryCase.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      amount: true,
      recoveredAmount: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const byDay = new Map<
    string,
    { date: string; failedInr: number; recoveredInr: number; cases: number }
  >();

  for (const c of cases) {
    const day = c.createdAt.toISOString().slice(0, 10);
    const row = byDay.get(day) ?? {
      date: day,
      failedInr: 0,
      recoveredInr: 0,
      cases: 0,
    };
    row.failedInr += c.amount / 100;
    row.cases += 1;
    byDay.set(day, row);

    if (c.status === "RECOVERED" && c.recoveredAmount > 0) {
      const rDay = c.updatedAt.toISOString().slice(0, 10);
      const rRow = byDay.get(rDay) ?? {
        date: rDay,
        failedInr: 0,
        recoveredInr: 0,
        cases: 0,
      };
      rRow.recoveredInr += c.recoveredAmount / 100;
      byDay.set(rDay, rRow);
    }
  }

  const series = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  let cumFailed = 0;
  let cumRecovered = 0;
  const cumulative = series.map((d) => {
    cumFailed += d.failedInr;
    cumRecovered += d.recoveredInr;
    return {
      ...d,
      cumulativeFailedInr: Math.round(cumFailed),
      cumulativeRecoveredInr: Math.round(cumRecovered),
    };
  });

  res.json({ series: cumulative });
  })
);

analyticsRouter.get("/evaluation", (_req, res) => {
  res.json(EVAL_SNAPSHOT);
});
