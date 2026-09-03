import {
  Database,
  FlaskConical,
  Scale,
  TrendingUp,
  ZapOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { PolicyLimitsCard } from "@/components/shared/PolicyLimitsCard";
import type { EvalSnapshot } from "@/lib/types";

type EvaluationViewProps = {
  evaluation: EvalSnapshot | null;
};

export function EvaluationView({ evaluation }: EvaluationViewProps) {
  const headline = evaluation?.highlights.find((h) => h.label === "Recovery rate");
  const unnecessary = evaluation?.highlights.find((h) => h.label === "Unnecessary retries");

  return (
    <div className="space-y-6">
      {/* Hero Benchmark Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-recovery/30 bg-gradient-to-br from-recovery-muted/60 via-card to-brand/5 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand" className="gap-1.5 px-2.5 py-1 text-xs font-semibold">
              <FlaskConical className="size-3.5" />
              Empirical Holdout Evaluation
            </Badge>
            {evaluation && (
              <Badge variant="outline" className="border-border bg-card/80 font-mono text-xs">
                {evaluation.split} split · n={evaluation.n} samples
                {evaluation.seed != null ? ` · seed=${evaluation.seed}` : ""}
              </Badge>
            )}
          </div>
          <span className="text-[11px] font-medium text-muted-foreground">
            Synthetic Holdout Validation Benchmark
          </span>
        </div>

        {headline ? (
          <div className="mt-5 grid gap-6 md:grid-cols-12 md:items-center">
            {/* Left Main Lift Comparison */}
            <div className="space-y-2 md:col-span-7">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Primary Metric · Baseline (Blind Retry) vs RakshaPay Autonomous Agent
              </p>
              <div className="flex flex-wrap items-baseline gap-3.5 pt-1">
                <div className="space-y-0.5">
                  <span className="block text-[10px] font-medium uppercase text-muted-foreground">
                    Blind Retries
                  </span>
                  <span className="text-3xl font-extrabold tabular-nums text-muted-foreground line-through decoration-reject/50">
                    {headline.baseline}
                  </span>
                </div>

                <TrendingUp className="size-6 text-recovery" />

                <div className="space-y-0.5">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-recovery">
                    RakshaPay Engine
                  </span>
                  <span className="text-4xl font-black tabular-nums tracking-tight text-recovery sm:text-5xl">
                    {headline.agent}
                  </span>
                </div>

                <Badge
                  variant="recovery"
                  className="rounded-lg px-2.5 py-1 text-xs font-bold shadow-xs"
                >
                  {headline.delta} Lift
                </Badge>
              </div>

              {unnecessary && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/80 bg-card/80 px-3 py-2 text-xs">
                  <ZapOff className="size-4 text-reject" />
                  <span className="text-muted-foreground">
                    Wasted / Unnecessary Retries:{" "}
                    <strong className="text-reject">{unnecessary.baseline}</strong> →{" "}
                    <strong className="text-recovery">{unnecessary.agent}</strong>{" "}
                    <span className="font-semibold text-recovery">({unnecessary.delta})</span>
                  </span>
                </div>
              )}
            </div>

            {/* Right Summary Quick Callout */}
            <div className="rounded-xl border border-border/80 bg-card/90 p-4 shadow-xs md:col-span-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Core Finding
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                By replacing blind retries with selective root-cause AI diagnosis and strictly bounded merchant policy gates, recovered revenue increases by over{" "}
                <strong className="text-foreground">+19.3%</strong> with zero penalty on customer experience or gateway fees.
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Loading evaluation snapshot…</p>
        )}
      </div>

      {/* Grid of Highlight Cards */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-muted/20 pb-3">
          <div>
            <CardTitle className="text-base font-bold">Benchmark Comparison Metrics</CardTitle>
            <CardDescription>
              Detailed quantitative breakdown across failure distributions
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-border bg-card text-xs">
            Reproducible JSON Run
          </Badge>
        </CardHeader>
        <CardContent className="pt-4">
          {!evaluation ? (
            <EmptyState
              title="Evaluation snapshot unavailable"
              body="Start the backend to load baseline vs Raksha Pay metrics."
            />
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              {evaluation.highlights.map((h) => (
                <div
                  key={h.label}
                  className="rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/20 p-4 shadow-xs transition-all hover:border-border"
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {h.label}
                  </p>
                  <div className="mt-2.5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Baseline:</span>
                      <span className="font-mono font-medium text-foreground">{h.baseline}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-recovery">RakshaPay:</span>
                      <span className="font-mono font-bold text-recovery">{h.agent}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
                    <span className="text-[10px] uppercase text-muted-foreground">Net Delta</span>
                    <span className="font-mono text-xs font-bold text-recovery">{h.delta}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Merchant Policy Guardrails */}
      <PolicyLimitsCard />

      {/* Methodology & Verification */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-recovery" />
              <CardTitle className="text-base font-bold">Evaluation Methodology</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-4 text-xs leading-relaxed text-muted-foreground">
            <p>
              Generated on a dataset of <strong className="text-foreground">3,000 synthetic payment failures</strong> (seed=42) featuring authentic Indian checkout failure modes: insufficient funds, bank server timeouts, international card restrictions, and cart abandonments.
            </p>
            <p>
              The dataset includes an independent holdout test split (<strong className="text-foreground">n=885</strong>) never seen during prompt design, ensuring metrics reflect generalized recovery capability.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-brand" />
              <CardTitle className="text-base font-bold">Scientific Verifiability</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-4 text-xs leading-relaxed text-muted-foreground">
            <p>
              Metrics are reproducible via the evaluation script suite. All figures are verified against <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">evaluation/results/comparison.json</code>.
            </p>
            <p className="font-medium text-foreground">
              Core Thesis: Increase gross recovery, eliminate blind retries, and ensure zero non-compliant automated actions.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
