import { formatTime } from "@/lib/format";
import { getAuditEventMeta, TONE_CLASSES } from "@/lib/audit-events";
import type { AuditLog } from "@/lib/types";
import { cn } from "@/lib/utils";

type AuditTimelineProps = {
  audits: AuditLog[];
  selectedCaseId?: string | null;
  maxHeight?: string;
  compact?: boolean;
};

export function AuditTimeline({
  audits,
  selectedCaseId,
  maxHeight = "max-h-[calc(100vh-14rem)]",
  compact = false,
}: AuditTimelineProps) {
  if (audits.length === 0) return null;

  return (
    <ol className={cn("relative space-y-0 overflow-auto pl-1", maxHeight)}>
      {audits.map((a, index) => {
        const meta = getAuditEventMeta(a.eventType);
        const Icon = meta.icon;
        const isLast = index === audits.length - 1;
        const highlighted = selectedCaseId && a.recoveryCaseId === selectedCaseId;

        return (
          <li key={a.id} className="relative flex gap-3 pb-4">
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[15px] top-8 h-[calc(100%-0.5rem)] w-px bg-border"
              />
            )}
            <div
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border",
                TONE_CLASSES[meta.tone]
              )}
            >
              <Icon className="size-3.5" />
            </div>
            <div
              className={cn(
                "min-w-0 flex-1 rounded-lg border border-transparent px-1 py-0.5",
                highlighted && "border-recovery/20 bg-accent/50"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {formatTime(a.createdAt)}
                </span>
              </div>
              {!compact && (
                <p className="mt-0.5 text-sm text-muted-foreground">{a.message}</p>
              )}
              {compact && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.message}</p>
              )}
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/80">
                {a.eventType}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
