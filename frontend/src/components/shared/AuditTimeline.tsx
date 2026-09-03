import { formatTime } from "@/lib/format";
import { getAuditEventMeta, TONE_CLASSES } from "@/lib/audit-events";
import type { AuditLog } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

type AuditTimelineProps = {
  audits: AuditLog[];
  selectedCaseId?: string | null;
  selectedAuditId?: string | null;
  onSelectAudit?: (audit: AuditLog) => void;
  maxHeight?: string;
  compact?: boolean;
};

export function AuditTimeline({
  audits,
  selectedCaseId,
  selectedAuditId,
  onSelectAudit,
  maxHeight = "max-h-[calc(100vh-14rem)]",
  compact = false,
}: AuditTimelineProps) {
  if (audits.length === 0) return null;

  return (
    <ol className={cn("relative space-y-0 overflow-auto pr-2", maxHeight)}>
      {audits.map((a, index) => {
        const meta = getAuditEventMeta(a.eventType);
        const Icon = meta.icon;
        const isLast = index === audits.length - 1;
        const highlighted = selectedCaseId && a.recoveryCaseId === selectedCaseId;
        const isSelected = selectedAuditId && a.id === selectedAuditId;

        return (
          <li key={a.id} className="group relative flex gap-3.5 pb-4">
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[17px] top-8 h-[calc(100%-0.5rem)] w-[1.5px] bg-border/80 transition-colors group-hover:bg-border"
              />
            )}
            <div
              className={cn(
                "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/80 shadow-xs transition-transform group-hover:scale-105",
                TONE_CLASSES[meta.tone]
              )}
            >
              <Icon className="size-4" />
            </div>

            <div
              onClick={() => onSelectAudit?.(a)}
              className={cn(
                "min-w-0 flex-1 rounded-xl border border-border/60 bg-card/60 p-3 shadow-xs transition-all",
                onSelectAudit && "cursor-pointer hover:border-border hover:bg-muted/40",
                highlighted && "border-recovery/30 bg-recovery/5",
                isSelected && "border-recovery bg-recovery/10 ring-1 ring-recovery/30"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-tight text-foreground">{meta.label}</span>
                  {a.recoveryCaseId && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {a.recoveryCaseId.slice(0, 8)}...
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatTime(a.createdAt)}
                  </span>
                  {onSelectAudit && (
                    <ChevronRight className="size-3 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                  )}
                </div>
              </div>

              {!compact && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.message}</p>
              )}
              {compact && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.message}</p>
              )}

              <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-1.5 text-[10px]">
                <span className="font-mono uppercase tracking-wider text-muted-foreground/70">
                  {a.eventType}
                </span>
                {a.metadata && Object.keys(a.metadata).length > 0 && (
                  <span className="text-[10px] font-medium text-recovery">
                    + {Object.keys(a.metadata).length} metadata fields
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
