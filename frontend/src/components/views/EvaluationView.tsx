import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import type { EvalSnapshot } from "@/lib/types";

type EvaluationViewProps = {
  evaluation: EvalSnapshot | null;
};

export function EvaluationView({ evaluation }: EvaluationViewProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Held-out evaluation</CardTitle>
            <CardDescription className="mt-1">
              Offline experiment: blind retry baseline vs RazorRecover (rules + policy).
            </CardDescription>
          </div>
          <Badge variant="muted">
            {evaluation ? `${evaluation.split} · n=${evaluation.n}` : "loading…"}
          </Badge>
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

      <Card>
        <CardHeader>
          <CardTitle>How to read this</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Numbers come from a static evaluation snapshot (3000 synthetic failures, holdout
            split) — not live DB aggregates.
          </p>
          <p>
            RazorRecover beats blind retry on recovery rate while cutting unnecessary retries to
            zero via policy gates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
