import { useEffect, type ReactNode } from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { AiSourceBadge } from "@/components/shared/AiSourceBadge";
import { AuditTimeline } from "@/components/shared/AuditTimeline";
import { RecoveryFlowStepper } from "@/components/shared/RecoveryFlowStepper";
import { formatDateTime, formatInr } from "@/lib/format";
import type { RecoveryCase } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

function getCustomerHistory(selected: RecoveryCase) {
  const failed = selected.audits?.find((a) => a.eventType === "payment.failed");
  return failed?.metadata?.customerHistory ?? null;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 border-b border-border/50 py-2 last:border-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

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
  const history = getCustomerHistory(selected);
  const currency = selected.currency ?? "INR";
  const latestAction = selected.actions?.[selected.actions.length - 1];
  const paymentLink = latestAction?.metadata?.shortUrl;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {formatInr(selected.amount / 100)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {currency} · {formatDateTime(selected.createdAt)}
            </p>
          </div>
          <StatusBadge status={selected.status} size="md" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <AiSourceBadge decisions={selected.decisions} />
          {selected.status === "ESCALATED" && <Badge variant="escalate">Needs human</Badge>}
          {selected.status === "REJECTED" && <Badge variant="reject">Policy blocked</Badge>}
          {selected.status === "RECOVERED" && <Badge variant="recovery">Verified</Badge>}
        </div>
      </div>

      {selected.status === "RECOVERED" && (
        <div className="rounded-xl border border-recovery/30 bg-recovery-muted/50 px-4 py-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-recovery-foreground">
            Verified recovered
          </p>
          <p className="text-xl font-bold tabular-nums text-recovery">
            {formatInr(selected.recoveredAmount / 100)}
          </p>
        </div>
      )}

      <Section title="Case identifiers">
        <dl className="rounded-xl border border-border/70 bg-card px-3">
          <DetailRow label="Case ID" value={<span className="font-mono text-xs">{selected.id}</span>} />
          <DetailRow
            label="Payment ID"
            value={
              selected.payment?.razorpayPaymentId ? (
                <span className="font-mono text-xs">{selected.payment.razorpayPaymentId}</span>
              ) : selected.paymentId ? (
                <span className="font-mono text-xs">{selected.paymentId}</span>
              ) : null
            }
          />
          <DetailRow
            label="Customer ID"
            value={
              selected.customerId ? (
                <span className="font-mono text-xs">{selected.customerId}</span>
              ) : null
            }
          />
          <DetailRow label="Attempts" value={selected.attemptCount != null ? String(selected.attemptCount) : null} />
          <DetailRow
            label="Updated"
            value={selected.updatedAt ? formatDateTime(selected.updatedAt) : null}
          />
        </dl>
      </Section>

      <Section title="Payment failure">
        <dl className="rounded-xl border border-border/70 bg-card px-3">
          <DetailRow
            label="Reason"
            value={selected.failureReason ?? selected.payment?.failureReason ?? "Not recorded"}
          />
          <DetailRow label="Method" value={selected.payment?.method} />
          <DetailRow label="Gateway status" value={selected.payment?.status} />
          <DetailRow
            label="Original amount"
            value={
              selected.payment
                ? formatInr(selected.payment.amount / 100)
                : formatInr(selected.amount / 100)
            }
          />
        </dl>
      </Section>

      <Section title="AI diagnosis">
        <dl className="rounded-xl border border-border/70 bg-card px-3">
          <DetailRow
            label="Diagnosis"
            value={selected.diagnosis?.replace(/_/g, " ") ?? "Pending"}
          />
          <DetailRow
            label="Recommended"
            value={selected.recommendedAction?.replace(/_/g, " ") ?? "—"}
          />
          <DetailRow
            label="Confidence"
            value={
              selected.diagnosisConfidence != null
                ? `${(selected.diagnosisConfidence * 100).toFixed(0)}%`
                : null
            }
          />
          <DetailRow
            label="Expected recovery"
            value={
              selected.expectedRecoveryProbability != null
                ? `${(selected.expectedRecoveryProbability * 100).toFixed(0)}%`
                : null
            }
          />
        </dl>
      </Section>

      {(selected.customer || history) && (
        <Section title="Customer">
          <dl className="rounded-xl border border-border/70 bg-card px-3">
            <DetailRow label="Name" value={selected.customer?.name} />
            <DetailRow label="Email" value={selected.customer?.email} />
            <DetailRow label="Phone" value={selected.customer?.phone} />
            <DetailRow
              label="History"
              value={
                history?.successfulPayments
                  ? `${history.successfulPayments} successful payment${history.successfulPayments === 1 ? "" : "s"}${history.isLoyalCustomer ? " · loyal" : ""}`
                  : selected.customer?.successfulPayments
                    ? `${selected.customer.successfulPayments} successful payments`
                    : null
              }
            />
            <DetailRow
              label="Avg ticket"
              value={
                selected.customer?.avgAmount
                  ? formatInr(selected.customer.avgAmount / 100)
                  : null
              }
            />
          </dl>
        </Section>
      )}

      <RecoveryFlowStepper recoveryCase={selected} />

      <Section title="Recovery actions">
        {(selected.actions?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No recovery action executed yet.</p>
        ) : (
          <ul className="space-y-2">
            {selected.actions.map((a, i) => (
              <li key={`${a.actionType}-${i}`} className="rounded-xl border border-border/70 bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {a.actionType.replace(/_/g, " ")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {a.policyDecision && (
                      <Badge
                        variant={
                          a.policyDecision === "APPROVED"
                            ? "recovery"
                            : a.policyDecision === "ESCALATE"
                              ? "escalate"
                              : "reject"
                        }
                      >
                        Policy {a.policyDecision}
                      </Badge>
                    )}
                    <Badge variant="muted">{a.status}</Badge>
                  </div>
                </div>
                {a.metadata?.message && (
                  <p className="mt-2 text-xs text-muted-foreground">{a.metadata.message}</p>
                )}
                {a.razorpayRefId && (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    Razorpay ref: {a.razorpayRefId}
                  </p>
                )}
                {a.metadata?.shortUrl && (
                  <a
                    href={a.metadata.shortUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-recovery hover:underline"
                  >
                    Open payment link
                    <ExternalLink className="size-3" />
                  </a>
                )}
                {a.createdAt && (
                  <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(a.createdAt)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {paymentLink && selected.status === "WAITING_FOR_WEBHOOK" && (
        <a
          href={paymentLink}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-recovery/30 bg-recovery-muted/40 px-3 py-2 text-sm font-semibold text-recovery"
        >
          Customer payment link
          <ExternalLink className="size-3.5" />
        </a>
      )}

      <Section title="AI agent decisions">
        {(selected.decisions?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No decisions stored.</p>
        ) : (
          <ul className="space-y-2">
            {selected.decisions!.map((d) => (
              <li key={d.id} className="rounded-xl border border-border/70 bg-card p-3">
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {d.agent.replace(/_gemini$/, "").replace(/_/g, " ")}
                  {d.rawJson?.source ? ` · ${d.rawJson.source}` : ""}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {d.diagnosis?.replace(/_/g, " ") ?? d.recommendedAction?.replace(/_/g, " ") ?? "—"}
                  {d.confidence != null ? ` (${(d.confidence * 100).toFixed(0)}%)` : ""}
                </p>
                {d.recommendedAction && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Action: {d.recommendedAction.replace(/_/g, " ")}
                  </p>
                )}
                {d.reason && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {(selected.results?.length ?? 0) > 0 && (
        <Section title="Verification results">
          <ul className="space-y-2">
            {selected.results!.map((r, i) => (
              <li key={i} className="rounded-xl border border-border/70 bg-card p-3 text-sm">
                <p className={r.success ? "font-semibold text-recovery" : "font-semibold text-reject"}>
                  {r.success ? "Verified success" : "Verification failed"}
                </p>
                <p className="mt-1 tabular-nums">{formatInr(r.recoveredAmount / 100)}</p>
                {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
                {r.verifiedAt && (
                  <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(r.verifiedAt)}</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Case audit trail">
        {(selected.audits?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No audit events for this case.</p>
        ) : (
          <AuditTimeline audits={selected.audits!} maxHeight="max-h-[320px]" />
        )}
      </Section>

      {selected.status === "WAITING_FOR_WEBHOOK" && (
        <Button className="w-full" disabled={busy} onClick={() => onSimulateCapture(selected.id)}>
          Simulate payment.captured
        </Button>
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
        className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl drawer-slide-in"
      >
        <div className="flex items-center justify-between border-b border-border/80 bg-muted/20 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-foreground">Case detail</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{selected.id}</p>
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
