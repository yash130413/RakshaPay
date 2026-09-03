import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  ShieldAlert,
  UserCheck,
  UserPlus,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { AuditTimeline } from "@/components/shared/AuditTimeline";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDateTime, formatInr } from "@/lib/format";
import type { RecoveryCase } from "@/lib/types";
import { cn } from "@/lib/utils";

type ReviewViewProps = {
  cases: RecoveryCase[];
  busy: boolean;
  merchantName: string;
  onAssign: (caseId: string, payload: {
    mode: "SELF" | "MANUAL";
    assignedTo: string;
    assignedToRole: string;
  }) => Promise<void>;
  onReview: (caseId: string, payload: {
    action: "approve" | "reject" | "request_info";
    notes: string;
    reviewedBy: string;
  }) => Promise<void>;
};

export function ReviewView({
  cases,
  busy,
  merchantName,
  onAssign,
  onReview,
}: ReviewViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const queue = useMemo(
    () => cases.filter((c) => c.status === "ESCALATED"),
    [cases]
  );

  const selected = useMemo(
    () => queue.find((c) => c.id === selectedId) ?? queue[0] ?? null,
    [queue, selectedId]
  );

  const stats = useMemo(() => {
    const unassigned = queue.filter((c) => !c.assignedTo).length;
    const assigned = queue.filter((c) => c.assignedTo).length;
    const amount = queue.reduce((n, c) => n + c.amount, 0) / 100;
    return { total: queue.length, unassigned, assigned, amount };
  }, [queue]);

  const reviewedBy = selected?.assignedTo || merchantName;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="In queue" value={String(stats.total)} hint="Needs human review" icon={ShieldAlert} tone="escalate" />
        <StatCard label="Unassigned" value={String(stats.unassigned)} hint="Waiting for assignment" icon={UserPlus} />
        <StatCard label="Assigned" value={String(stats.assigned)} hint="Ready for review actions" icon={UserCheck} tone="recovery" />
        <StatCard label="At risk" value={formatInr(stats.amount)} hint="Held by policy gate" icon={ClipboardList} />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="overflow-hidden border-border/80 shadow-sm lg:col-span-5">
          <div className="border-b border-border/80 bg-muted/20 px-4 py-3">
            <h2 className="text-sm font-bold">Human review queue</h2>
            <p className="text-xs text-muted-foreground">Only escalated cases — AI cannot execute these</p>
          </div>
          <CardContent className="p-0">
            {queue.length === 0 ? (
              <div className="px-4 py-10">
                <EmptyState
                  title="No cases waiting for humans"
                  body="Run the Escalate demo from the top bar, or wait for a high-value failure."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {queue.map((c) => {
                  const active = (selected?.id ?? "") === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(c.id);
                          setNotes(c.reviewNotes ?? "");
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40",
                          active && "bg-escalate-muted/40 ring-1 ring-inset ring-escalate/20"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold tabular-nums">{formatInr(c.amount / 100)}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {c.failureReason ?? "No failure reason"} · {c.diagnosis?.replace(/_/g, " ") ?? "Pending"}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <StatusBadge status={c.status} />
                            {c.assignedTo ? (
                              <Badge variant="outline" className="text-[10px]">
                                {c.assignedTo}
                              </Badge>
                            ) : (
                              <Badge variant="escalate" className="text-[10px]">
                                Unassigned
                              </Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/80 shadow-sm lg:col-span-7">
          {!selected ? (
            <div className="px-4 py-16">
              <EmptyState title="Select a case" body="Pick an escalated case from the queue to assign and review." />
            </div>
          ) : (
            <>
              <div className="border-b border-border/80 bg-muted/20 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold">Review workspace</h2>
                    <p className="font-mono text-[10px] text-muted-foreground">{selected.id}</p>
                  </div>
                  <StatusBadge status={selected.status} size="md" />
                </div>
              </div>
              <CardContent className="space-y-5 p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Info label="Amount" value={formatInr(selected.amount / 100)} />
                  <Info label="Failure" value={selected.failureReason ?? "—"} />
                  <Info label="AI diagnosis" value={selected.diagnosis?.replace(/_/g, " ") ?? "Pending"} />
                  <Info
                    label="AI recommended"
                    value={selected.recommendedAction?.replace(/_/g, " ") ?? "—"}
                  />
                </div>

                <section className="rounded-xl border border-border/70 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Assignment
                  </p>
                  {selected.assignedTo ? (
                    <div className="mt-2 rounded-lg border border-recovery/20 bg-recovery-muted/30 px-3 py-2 text-sm">
                      Assigned to <strong>{selected.assignedTo}</strong>
                      {selected.assignedToRole ? ` · ${selected.assignedToRole}` : ""}
                      {selected.assignedAt ? (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {formatDateTime(selected.assignedAt)}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <Button
                      disabled={busy}
                      className="mt-3 h-auto w-full flex-col items-start gap-1 py-3"
                      onClick={() =>
                        onAssign(selected.id, {
                          mode: "SELF",
                          assignedTo: merchantName,
                          assignedToRole: "Merchant",
                        })
                      }
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <UserCheck className="size-4" />
                        Merchant reviews
                      </span>
                      <span className="text-left text-[11px] font-normal opacity-80">
                        Assign this case to {merchantName} and then approve, reject, or request info
                      </span>
                    </Button>
                  )}
                </section>

                <section className="rounded-xl border border-border/70 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Review actions
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Assign first, then approve (execute recovery), reject, or request more info.
                  </p>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Review notes (required for request info)"
                    className="mt-3 h-9 text-xs"
                  />
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <Button
                      disabled={busy || !selected.assignedTo}
                      className="gap-1.5 bg-recovery text-white hover:bg-recovery/90"
                      onClick={() =>
                        onReview(selected.id, {
                          action: "approve",
                          notes,
                          reviewedBy,
                        })
                      }
                    >
                      <CheckCircle2 className="size-3.5" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={busy || !selected.assignedTo}
                      className="gap-1.5"
                      onClick={() =>
                        onReview(selected.id, {
                          action: "reject",
                          notes,
                          reviewedBy,
                        })
                      }
                    >
                      <XCircle className="size-3.5" />
                      Reject
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || !selected.assignedTo}
                      className="gap-1.5"
                      onClick={() =>
                        onReview(selected.id, {
                          action: "request_info",
                          notes,
                          reviewedBy,
                        })
                      }
                    >
                      <MessageSquare className="size-3.5" />
                      Request info
                    </Button>
                  </div>
                </section>

                {selected.reviewNotes && (
                  <div className="rounded-lg border border-escalate/20 bg-escalate-muted/30 px-3 py-2 text-xs">
                    <span className="font-semibold">Latest notes: </span>
                    {selected.reviewNotes}
                  </div>
                )}

                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Audit trail
                  </p>
                  {(selected.audits?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No audit events yet.</p>
                  ) : (
                    <AuditTimeline audits={selected.audits!} maxHeight="max-h-[280px]" />
                  )}
                </section>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof ShieldAlert;
  tone?: "escalate" | "recovery";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3.5 shadow-sm",
        tone === "escalate" && "border-escalate/25 bg-gradient-to-br from-escalate-muted/40 via-card to-card",
        tone === "recovery" && "border-recovery/25 bg-gradient-to-br from-recovery-muted/40 via-card to-card",
        !tone && "border-border/80"
      )}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
        <Icon className="size-3.5" />
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}
