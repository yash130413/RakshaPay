import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Search,
  ShieldAlert,
  Wallet,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { AiSourceBadge } from "@/components/shared/AiSourceBadge";
import { CaseDetailDrawer } from "@/components/shared/CaseDetailDrawer";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatInr, formatTime } from "@/lib/format";
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

const FILTERS: { id: StatusFilter; icon: typeof ClipboardList }[] = [
  { id: "ALL", icon: ClipboardList },
  { id: "WAITING_FOR_WEBHOOK", icon: Clock },
  { id: "RECOVERED", icon: CheckCircle2 },
  { id: "ESCALATED", icon: ShieldAlert },
  { id: "REJECTED", icon: XCircle },
];

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
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    const recovered = cases.filter((c) => c.status === "RECOVERED");
    const awaiting = cases.filter((c) => c.status === "WAITING_FOR_WEBHOOK").length;
    const escalated = cases.filter((c) => c.status === "ESCALATED").length;
    const recoveredInr = recovered.reduce((n, c) => n + c.recoveredAmount, 0) / 100;
    const atRiskInr =
      cases
        .filter((c) => c.status !== "RECOVERED" && c.status !== "REJECTED")
        .reduce((n, c) => n + c.amount, 0) / 100;

    return {
      total: cases.length,
      recovered: recovered.length,
      awaiting,
      escalated,
      recoveredInr,
      atRiskInr,
    };
  }, [cases]);

  const visibleCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredCases;

    return filteredCases.filter((c) => {
      const summary = formatCaseSummary(c).toLowerCase();
      const action = (c.recommendedAction ?? "").toLowerCase();
      const diagnosis = (c.diagnosis ?? "").toLowerCase();
      const reason = (c.failureReason ?? "").toLowerCase();
      const id = c.id.toLowerCase();
      const amount = String(c.amount / 100);
      return (
        summary.includes(q) ||
        action.includes(q) ||
        diagnosis.includes(q) ||
        reason.includes(q) ||
        id.includes(q) ||
        amount.includes(q)
      );
    });
  }, [filteredCases, search]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Total cases</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-muted">
              <ClipboardList className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{stats.total}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">All recovery pipelines</p>
        </div>

        <div className="rounded-xl border border-recovery/25 bg-gradient-to-br from-recovery-muted/50 via-card to-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-recovery">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-recovery-foreground">
              Recovered
            </span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-recovery-muted text-recovery">
              <CheckCircle2 className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-recovery">
            {stats.recovered}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{formatInr(stats.recoveredInr)} captured</p>
        </div>

        <div className="rounded-xl border border-brand/20 bg-gradient-to-br from-brand/5 via-card to-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-brand">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Awaiting</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <Clock className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{stats.awaiting}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Payment link pending</p>
        </div>

        <div className="rounded-xl border border-escalate/20 bg-gradient-to-br from-escalate-muted/40 via-card to-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-escalate">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-escalate-foreground">
              At risk
            </span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-escalate-muted text-escalate">
              <Wallet className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{formatInr(stats.atRiskInr)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{stats.escalated} escalated</p>
        </div>
      </div>

      <Card className="overflow-hidden border-border/80 shadow-sm">
        <div className="border-b border-border/80 bg-muted/20 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight sm:text-lg">Recovery cases</h2>
                <Badge variant="outline" className="border-border bg-card text-[11px] font-semibold">
                  {visibleCases.length} shown
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Open a case for diagnosis, policy decision, and audit trail
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search diagnosis, action, reason, or amount…"
                className="h-9 bg-card pl-9 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map(({ id, icon: Icon }) => {
                const isActive = filter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onFilterChange(id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                      isActive
                        ? "border-recovery bg-recovery/10 font-semibold text-recovery shadow-sm"
                        : "border-border/80 bg-card text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-3" />
                    {formatFilterLabel(id)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          {cases.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                title="No recovery cases"
                body="Run a demo from the top bar to create the first case."
              />
            </div>
          ) : visibleCases.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                title="No matching cases"
                body="Try another filter or a shorter search query."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {visibleCases.slice(0, 40).map((c) => {
                const isSelected = selectedId === c.id;
                const summary = formatCaseSummary(c);
                const action = c.recommendedAction?.replace(/_/g, " ") ?? null;

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors sm:gap-4 sm:px-6",
                        "hover:bg-muted/40",
                        isSelected && "bg-recovery/5 ring-1 ring-inset ring-recovery/20"
                      )}
                      onClick={() => onSelectCase(c.id)}
                    >
                      <div className="min-w-[6.5rem] shrink-0">
                        <p className="text-base font-bold tabular-nums tracking-tight text-foreground">
                          {formatInr(c.amount / 100)}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {formatTime(c.createdAt)}
                        </p>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{summary}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {action && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {action}
                            </span>
                          )}
                          {c.status === "RECOVERED" && (
                            <span className="text-[11px] font-semibold text-recovery">
                              +{formatInr(c.recoveredAmount / 100)}
                            </span>
                          )}
                          <span className="hidden font-mono text-[10px] text-muted-foreground/70 sm:inline">
                            {c.id.slice(0, 10)}…
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                        <AiSourceBadge decisions={c.decisions} />
                        <StatusBadge status={c.status} />
                        <ChevronRight
                          className={cn(
                            "hidden size-4 text-muted-foreground/50 sm:block",
                            isSelected && "text-recovery"
                          )}
                        />
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
    </div>
  );
}
