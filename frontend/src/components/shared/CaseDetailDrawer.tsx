import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { AiSourceBadge } from "@/components/shared/AiSourceBadge";
import { AuditTimeline } from "@/components/shared/AuditTimeline";
import { RecoveryFlowStepper } from "@/components/shared/RecoveryFlowStepper";
import { formatInr, formatTime } from "@/lib/format";
import type { RecoveryCase } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

type CaseDetailContentProps = {
  selected: RecoveryCase;
  busy: boolean;
  onSimulateCapture: (caseId: string) => void;
};

export function CaseDetailContent({
  selected,
  busy,
  onSimulateCapture,
}: CaseDetailContentProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {formatInr(selected.amount / 100)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected.failureReason ?? "No failure reason"} · {formatTime(selected.createdAt)}
          </p>
        </div>
        <StatusBadge status={selected.status} size="md" />
      </div>

      <AiSourceBadge decisions={selected.decisions} />

      <div className="flex flex-wrap gap-1.5">
        {selected.status === "ESCALATED" && <Badge variant="escalate">Needs human</Badge>}
        {selected.status === "REJECTED" && <Badge variant="reject">Policy blocked</Badge>}
      </div>

      <RecoveryFlowStepper recoveryCase={selected} />

      {selected.expectedRecoveryProbability != null && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Expected recovery
          </p>
          <p className="text-lg font-semibold text-recovery">
            {(selected.expectedRecoveryProbability * 100).toFixed(0)}%
          </p>
        </div>
      )}

      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                <span className="block font-mono text-[10px] uppercase text-muted-foreground">
                  {d.agent}
                </span>
                <span className="font-medium text-foreground">
                  {d.diagnosis ?? d.recommendedAction ?? "—"}
                  {d.confidence != null ? ` (${(d.confidence * 100).toFixed(0)}%)` : ""}
                </span>
                {d.reason && <p className="mt-1 text-xs text-muted-foreground">{d.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Case audit
        </h3>
        {(selected.audits?.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No audit events for this case.</p>
        ) : (
          <div className="mt-3">
            <AuditTimeline
              audits={selected.audits!}
              maxHeight="max-h-[280px]"
              compact
            />
          </div>
        )}
      </div>

      {selected.status === "WAITING_FOR_WEBHOOK" && (
        <Button className="w-full" disabled={busy} onClick={() => onSimulateCapture(selected.id)}>
          Simulate payment.captured
        </Button>
      )}

      {selected.status === "RECOVERED" && (
        <div className="rounded-lg border border-recovery/30 bg-accent px-3 py-2 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-recovery-foreground">
            Verified recovered
          </p>
          <p className="text-lg font-bold text-recovery">
            {formatInr(selected.recoveredAmount / 100)}
          </p>
        </div>
      )}
    </div>
  );
}

type CaseDetailDrawerProps = {
  open: boolean;
  selected: RecoveryCase | null;
  busy: boolean;
  onClose: () => void;
  onSimulateCapture: (caseId: string) => void;
};

export function CaseDetailDrawer({
  open,
  selected,
  busy,
  onClose,
  onSimulateCapture,
}: CaseDetailDrawerProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !selected) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close case detail"
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Case detail"
        className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl drawer-slide-in"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Case detail</p>
            <p className="text-xs text-muted-foreground">Flow · AI · audit trail</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <CaseDetailContent
            selected={selected}
            busy={busy}
            onSimulateCapture={onSimulateCapture}
          />
        </div>
      </aside>
    </div>
  );
}
