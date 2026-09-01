import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CaseDetailDrawer } from "@/components/shared/CaseDetailDrawer";
import { EmptyState } from "@/components/shared/EmptyState";
import { agentSource, formatInr, formatTime } from "@/lib/format";
import { formatCaseSummary, formatFilterLabel } from "@/lib/status";
import type { RecoveryCase, StatusFilter } from "@/lib/types";
import { cn } from "@/lib/utils";

type CasesViewProps = {
  cases: RecoveryCase[];
  filteredCases: RecoveryCase[];
  filter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  selected: RecoveryCase | null;
  selectedId: string | null;
  onSelectCase: (id: string) => void;
  onCloseCase: () => void;
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
  onCloseCase,
  busy,
  onSimulateCapture,
}: CasesViewProps) {
  return (
    <>
      <Card>
        <CardHeader className="space-y-3 pb-2">
          <div>
            <CardTitle className="text-base">Recovery cases</CardTitle>
            <CardDescription>
              {cases.length} total · click a row for AI decisions and audit trail
            </CardDescription>
          </div>
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
                {formatFilterLabel(f)}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:px-6 sm:pb-6">
          {cases.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState
                title="No recovery cases"
                body="Run a demo from the top bar to create the first case."
              />
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState
                title={`No ${formatFilterLabel(filter).toLowerCase()} cases`}
                body="Try another filter or run Escalate / Reject demos."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredCases.slice(0, 30).map((c) => {
                const source = agentSource(c.decisions);
                const isSelected = selectedId === c.id;
                const summary = formatCaseSummary(c);

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors sm:px-2",
                        "hover:bg-muted/50",
                        isSelected && "bg-accent/60"
                      )}
                      onClick={() => onSelectCase(c.id)}
                    >
                      <div className="min-w-[5.5rem] shrink-0">
                        <p className="text-base font-bold tabular-nums text-foreground">
                          {formatInr(c.amount / 100)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatTime(c.createdAt)}
                        </p>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{summary}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {source && (
                            <Badge
                              variant={source === "gemini" ? "gemini" : "rules"}
                              className="text-[10px]"
                            >
                              {source}
                            </Badge>
                          )}
                          {c.status === "RECOVERED" && (
                            <span className="text-[11px] font-medium text-recovery">
                              +{formatInr(c.recoveredAmount / 100)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={c.status} />
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <CaseDetailDrawer
        open={selectedId !== null && selected !== null}
        selected={selected}
        busy={busy}
        onClose={onCloseCase}
        onSimulateCapture={onSimulateCapture}
      />
    </>
  );
}
