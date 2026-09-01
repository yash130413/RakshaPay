import { FlaskConical, Shield, TrendingUp } from "lucide-react";
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
      <div className="rounded-xl border border-recovery/25 bg-gradient-to-br from-accent/60 via-card to-card px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">
            <FlaskConical className="mr-1 inline size-3" />
            Research · offline eval
          </Badge>
          {evaluation && (
            <Badge variant="muted">
              {evaluation.split} · n={evaluation.n}
              {evaluation.seed != null ? ` · seed=${evaluation.seed}` : ""}
            </Badge>
          )}
        </div>
        {headline ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">Blind retry baseline vs RazorRecover agent</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <span className="text-3xl font-bold tabular-nums text-muted-foreground line-through decoration-reject/40">
                {headline.baseline}
              </span>
              <TrendingUp className="mb-1 size-5 text-recovery" />
              <span className="text-4xl font-bold tabular-nums text-recovery">{headline.agent}</span>
              <Badge variant="recovery" className="mb-1">
                {headline.delta}
              </Badge>
            </div>
            {unnecessary && (
              <p className="mt-2 text-sm text-muted-foreground">
                Unnecessary retries:{" "}
                <strong className="text-reject">{unnecessary.baseline}</strong> →{" "}
                <strong className="text-recovery">{unnecessary.agent}</strong> ({unnecessary.delta})
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Loading evaluation snapshot…</p>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Full comparison</CardTitle>
            <CardDescription>
              Static snapshot from evaluation/results — not live DB aggregates
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {!evaluation ? (
            <EmptyState
              title="Evaluation snapshot unavailable"
              body="Start the backend to load baseline vs RazorRecover metrics."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {evaluation.highlights.map((h) => (
                <div key={h.label} className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {h.label}
                  </p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p>
                      <span className="text-xs uppercase text-muted-foreground">Baseline </span>
                      {h.baseline}
                    </p>
                    <p className="font-semibold text-recovery-foreground">
                      <span className="text-xs font-normal uppercase text-muted-foreground">
                        RazorRecover{" "}
                      </span>
                      {h.agent}
                    </p>
                  </div>
                  <p className="mt-2 text-sm font-bold text-recovery">{h.delta}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PolicyLimitsCard />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-recovery" />
            <CardTitle className="text-base">Methodology</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            3,000 synthetic payment failures (seed=42). Holdout split n=885. Baseline = blind retry on
            every failure. RazorRecover = rules + policy gates (same defaults as live demo).
          </p>
          <p>
            Live dashboard metrics come from Neon DB. This tab is the reproducible research artifact for
            judges — numbers match <code className="rounded bg-muted px-1 text-xs">evaluation/results/comparison.json</code>.
          </p>
          <p className="font-medium text-foreground">
            Thesis: recovery up, retries down, zero unnecessary retries when policy blocks bad actions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
