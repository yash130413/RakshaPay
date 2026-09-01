import { Brain, Database, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ApiHealth } from "@/lib/types";
import { cn } from "@/lib/utils";

type SystemStatusBarProps = {
  health: ApiHealth | null;
  backendOnline: boolean;
};

export function SystemStatusBar({ health, backendOnline }: SystemStatusBarProps) {
  const geminiOn = health?.llm?.configured ?? false;
  const model = health?.llm?.model ?? "gemini-3.6-flash";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill
        ok={backendOnline}
        icon={Database}
        label={backendOnline ? "Neon DB" : "DB offline"}
      />
      <StatusPill ok={geminiOn} icon={Sparkles} label={geminiOn ? `Gemini · ${model}` : "Gemini off"} />
      <StatusPill ok icon={Brain} label="Rules fallback ready" />
      <Badge variant="outline">Razorpay Test Mode</Badge>
    </div>
  );
}

function StatusPill({
  ok,
  icon: Icon,
  label,
}: {
  ok: boolean;
  icon: typeof Database;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        ok
          ? "border-recovery/30 bg-recovery-muted/50 text-recovery-foreground"
          : "border-reject-muted bg-reject-muted/40 text-reject-foreground"
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
