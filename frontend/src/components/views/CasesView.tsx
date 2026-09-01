import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { agentSource, formatInr, formatTime } from "@/lib/format";
import type { RecoveryCase, StatusFilter } from "@/lib/types";

type CasesViewProps = {
  cases: RecoveryCase[];
  filteredCases: RecoveryCase[];
  filter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  selected: RecoveryCase | null;
  selectedId: string | null;
  onSelectCase: (id: string) => void;
  busy: boolean;
  onSimulateCapture: (caseId: string) => void;
};

export function CasesView({
  cases,
  filteredCases,
  filter,
  onFilterChange,
  selected,
  selectedId,
  onSelectCase,
  busy,
  onSimulateCapture,
}: CasesViewProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between space-y-0 gap-3">
          <CardTitle>Recovery Cases</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {(
              ["ALL", "WAITING_FOR_WEBHOOK", "RECOVERED", "ESCALATED", "REJECTED"] as StatusFilter[]
            ).map((f) => (
              <Button
                key={f}
                type="button"
                size="pill"
                variant={filter === f ? "default" : "outline"}
                onClick={() => onFilterChange(f)}
              >
                {f === "WAITING_FOR_WEBHOOK" ? "WAITING" : f}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <EmptyState
              title="No recovery cases"
              body="Run a demo from the top bar to create the first case."
            />
          ) : filteredCases.length === 0 ? (
            <EmptyState
              title={`No ${filter === "ALL" ? "" : filter.toLowerCase()} cases`}
              body="Try another filter or run Escalate / Reject demos."
            />
          ) : (
            <ul className="flex max-h-[640px] flex-col gap-3 overflow-auto">
              {filteredCases.slice(0, 30).map((c) => {
                const latest = c.actions[c.actions.length - 1];
                const shortUrl =
                  latest?.metadata &&
                  typeof latest.metadata === "object" &&
                  "shortUrl" in latest.metadata
                    ? (latest.metadata as { shortUrl?: string }).shortUrl
                    : undefined;
                const source = agentSource(c.decisions);
                const isSelected = selectedId === c.id;

                return (
                  <li
                    key={c.id}
                    className={`cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:border-recovery ${
                      isSelected ? "border-recovery ring-1 ring-recovery/30" : "border-border"
                    }`}
                    onClick={() => onSelectCase(c.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-base">{formatInr(c.amount / 100)}</strong>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {c.diagnosis ?? "—"} → {c.recommendedAction ?? "—"}
                      {c.failureReason ? ` (${c.failureReason})` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {source && (
                        <Badge variant={source === "gemini" ? "gemini" : "rules"}>
                          {source}
                        </Badge>
                      )}
                      {c.status === "ESCALATED" && <Badge variant="escalate">needs human</Badge>}
                      {c.status === "REJECTED" && <Badge variant="reject">policy blocked</Badge>}
                    </div>
                    {shortUrl && (
                      <a
                        href={shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-sm text-brand hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open recovery link
                      </a>
                    )}
                    {c.status === "RECOVERED" && (
                      <p className="mt-1 text-sm font-semibold text-recovery">
                        Recovered {formatInr(c.recoveredAmount / 100)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="xl:sticky xl:top-24 xl:self-start">
        <CardHeader>
          <CardTitle>Case Detail</CardTitle>
        </CardHeader>
        <CardContent>
          {!selected ? (
            <EmptyState
              title="No case selected"
              body="Select a case to inspect AI decisions, policy outcome, and audit trail."
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-lg">{formatInr(selected.amount / 100)}</strong>
                <StatusBadge status={selected.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {selected.failureReason ?? "no failure reason"} · created{" "}
                {formatTime(selected.createdAt)}
              </p>

              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  AI decisions
                </h3>
                {(selected.decisions?.length ?? 0) === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No decisions stored.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {selected.decisions!.map((d) => (
                      <li
                        key={d.id}
                        className="rounded-lg border border-border bg-muted/40 p-3 text-sm"
                      >
                        <span className="block font-mono text-xs text-muted-foreground">
                          {d.agent}
                        </span>
                        <span>
                          {d.diagnosis ?? d.recommendedAction ?? "—"}
                          {d.confidence != null
                            ? ` (${(d.confidence * 100).toFixed(0)}%)`
                            : ""}
                        </span>
                        {d.reason && (
                          <p className="mt-1 text-xs text-muted-foreground">{d.reason}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selected.expectedRecoveryProbability != null && (
                <p className="text-sm text-muted-foreground">
                  Expected recovery: {(selected.expectedRecoveryProbability * 100).toFixed(0)}%
                </p>
              )}

              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Case audit
                </h3>
                {(selected.audits?.length ?? 0) === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No audit events for this case.</p>
                ) : (
                  <ol className="mt-2 max-h-[280px] space-y-1 overflow-auto">
                    {selected.audits!.map((a) => (
                      <li
                        key={a.id}
                        className="grid gap-1 rounded-md px-2 py-1.5 text-sm sm:grid-cols-[5.5rem_11rem_1fr]"
                      >
                        <span className="tabular-nums text-muted-foreground">
                          {formatTime(a.createdAt)}
                        </span>
                        <span className="font-mono text-xs text-recovery">{a.eventType}</span>
                        <span className="text-foreground">{a.message}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {selected.status === "WAITING_FOR_WEBHOOK" && (
                <Button disabled={busy} onClick={() => onSimulateCapture(selected.id)}>
                  Simulate payment.captured
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
