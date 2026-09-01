import { formatInr } from "@/lib/format";
import type { Summary } from "@/lib/types";
import { cn } from "@/lib/utils";

function HeroMetric({
  label,
  value,
  tone = "default",
  featured = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "recovery" | "muted";
  featured?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center rounded-xl border border-border bg-card px-5 py-4",
        featured && "border-recovery/30 bg-gradient-to-br from-accent/80 to-card shadow-sm"
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-bold tabular-nums tracking-tight",
          featured ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl",
          tone === "recovery" && "text-recovery",
          tone === "muted" && "text-muted-foreground",
          tone === "default" && "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "recovery" | "escalate" | "reject" | "default";
}) {
  const valueClass =
    tone === "recovery"
      ? "text-recovery"
      : tone === "escalate"
        ? "text-escalate"
        : tone === "reject"
          ? "text-reject"
          : "text-foreground";

  return (
    <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", valueClass)}>{value}</p>
    </div>
  );
}

type HeroMetricsProps = {
  summary: Summary | null;
};

export function HeroMetrics({ summary }: HeroMetricsProps) {
  const recoveryRate = `${((summary?.recoveryRate ?? 0) * 100).toFixed(1)}%`;
  const aiActions = (summary?.actions ?? []).reduce((n, a) => n + a.count, 0);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Revenue at a glance</h2>
        <p className="text-xs text-muted-foreground">Live metrics from your recovery ledger</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <HeroMetric label="At risk" value={formatInr(summary?.revenueAtRisk ?? 0)} />
        <HeroMetric
          label="Recovered"
          value={formatInr(summary?.recovered ?? 0)}
          tone="recovery"
          featured
        />
        <HeroMetric label="Recovery rate" value={recoveryRate} tone="recovery" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatPill label="Total cases" value={summary?.totalCases ?? 0} />
        <StatPill label="Recovered" value={summary?.recoveredCases ?? 0} tone="recovery" />
        <StatPill label="Escalated" value={summary?.escalatedCases ?? 0} tone="escalate" />
        <StatPill label="AI actions" value={aiActions} />
      </div>
    </section>
  );
}
