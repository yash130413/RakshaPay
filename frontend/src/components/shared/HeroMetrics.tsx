import { CheckCircle2, DollarSign, Percent, TrendingUp } from "lucide-react";
import { formatInr } from "@/lib/format";
import type { Summary } from "@/lib/types";

type HeroMetricsProps = {
  summary: Summary | null;
};

export function HeroMetrics({ summary }: HeroMetricsProps) {
  const recoveryRate = `${((summary?.recoveryRate ?? 0) * 100).toFixed(1)}%`;
  const aiActions = (summary?.actions ?? []).reduce((n, a) => n + a.count, 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
            Real-Time Revenue Performance
          </h2>
          <p className="text-xs text-muted-foreground">
            Live telemetry from autonomous recovery pipelines & policy ledger
          </p>
        </div>
      </div>

      {/* Main 3 High-Impact Cards */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        {/* At Risk Card */}
        <div className="relative overflow-hidden rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/30 p-4.5 shadow-sm transition-all hover:border-border">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Revenue At Risk
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <DollarSign className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
            {formatInr(summary?.revenueAtRisk ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Failed transaction inflow detected
          </p>
        </div>

        {/* Recovered Card (Featured) */}
        <div className="relative overflow-hidden rounded-xl border border-recovery/30 bg-gradient-to-br from-recovery-muted/60 via-card to-emerald-500/10 p-4.5 shadow-sm ring-1 ring-recovery/20 transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-recovery">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-recovery-foreground">
              Total Recovered
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-recovery-muted text-recovery shadow-xs">
              <TrendingUp className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-recovery sm:text-3xl">
            {formatInr(summary?.recovered ?? 0)}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-recovery-foreground">
            <CheckCircle2 className="size-3.5 text-recovery" />
            Verified captured funds
          </p>
        </div>

        {/* Recovery Rate */}
        <div className="relative overflow-hidden rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/30 p-4.5 shadow-sm transition-all hover:border-border">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recovery Efficiency
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Percent className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
            {recoveryRate}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Resolution rate across all active cases
          </p>
        </div>
      </div>

      {/* Secondary Stats Grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total Cases
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
            {summary?.totalCases ?? 0}
          </p>
        </div>

        <div className="rounded-xl border border-recovery/20 bg-recovery-muted/30 p-3 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-recovery-foreground">
            Recovered Cases
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-recovery">
            {summary?.recoveredCases ?? 0}
          </p>
        </div>

        <div className="rounded-xl border border-escalate/20 bg-escalate-muted/30 p-3 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-escalate-foreground">
            Escalated Cases
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-escalate">
            {summary?.escalatedCases ?? 0}
          </p>
        </div>

        <div className="rounded-xl border border-brand/20 bg-brand/5 p-3 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
            AI Automated Actions
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
            {aiActions}
          </p>
        </div>
      </div>
    </section>
  );
}
