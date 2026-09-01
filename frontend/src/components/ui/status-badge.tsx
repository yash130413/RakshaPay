import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string;
  className?: string;
};

const statusVariantMap: Record<
  string,
  "recovery" | "escalate" | "reject" | "default" | "muted"
> = {
  RECOVERED: "recovery",
  WAITING_FOR_WEBHOOK: "default",
  EXECUTING: "default",
  APPROVED: "default",
  ESCALATED: "escalate",
  FAILED: "reject",
  REJECTED: "reject",
};

export function statusBadgeVariant(status: string) {
  return statusVariantMap[status] ?? "muted";
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = statusBadgeVariant(status);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        variant === "recovery" && "bg-recovery-muted text-recovery-foreground",
        variant === "escalate" && "bg-escalate-muted text-escalate-foreground",
        variant === "reject" && "bg-reject-muted text-reject-foreground",
        variant === "default" && "bg-sky-100 text-sky-800",
        variant === "muted" && "bg-muted text-muted-foreground",
        className
      )}
    >
      {status}
    </span>
  );
}
