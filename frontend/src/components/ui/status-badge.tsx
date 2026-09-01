import { cn } from "@/lib/utils";
import { formatStatusLabel, statusBadgeVariant } from "@/lib/status";

type StatusBadgeProps = {
  status: string;
  className?: string;
  size?: "sm" | "md";
  showDot?: boolean;
};

export function StatusBadge({
  status,
  className,
  size = "sm",
  showDot = true,
}: StatusBadgeProps) {
  const variant = statusBadgeVariant(status);
  const label = formatStatusLabel(status);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        variant === "recovery" && "bg-recovery-muted text-recovery-foreground",
        variant === "escalate" && "bg-escalate-muted text-escalate-foreground",
        variant === "reject" && "bg-reject-muted text-reject-foreground",
        variant === "default" && "bg-sky-100 text-sky-800",
        variant === "muted" && "bg-muted text-muted-foreground",
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            variant === "recovery" && "bg-recovery",
            variant === "escalate" && "bg-escalate",
            variant === "reject" && "bg-reject",
            variant === "default" && "bg-sky-500",
            variant === "muted" && "bg-muted-foreground"
          )}
        />
      )}
      {label}
    </span>
  );
}
