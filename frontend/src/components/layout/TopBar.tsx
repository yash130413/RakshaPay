import { Sparkles, Store } from "lucide-react";
import { DemoMenu } from "./DemoMenu";
import type { ApiHealth, DemoScenario } from "@/lib/types";
import { cn } from "@/lib/utils";

type TopBarProps = {
  merchantName: string;
  backendOnline: boolean;
  health: ApiHealth | null;
  refreshing?: boolean;
  busy: boolean;
  onRunDemo: (scenario: DemoScenario) => void;
};

const TAGLINE = ["AI decides", "Policy controls", "Razorpay executes", "Webhooks verify"] as const;

function LiveStatus({ online, refreshing }: { online: boolean; refreshing: boolean }) {
  if (!online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-reject-muted bg-reject-muted/50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-reject-foreground">
        <span className="size-1.5 rounded-full bg-reject" />
        Offline
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-recovery/30 bg-recovery-muted/70 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-recovery">
      <span className="relative flex size-1.5">
        {!refreshing && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-recovery opacity-50" />
        )}
        <span
          className={cn(
            "relative inline-flex size-1.5 rounded-full bg-recovery",
            refreshing && "animate-pulse"
          )}
        />
      </span>
      {refreshing ? "Syncing" : "Live"}
    </span>
  );
}

export function TopBar({
  merchantName,
  backendOnline,
  health,
  refreshing = false,
  busy,
  onRunDemo,
}: TopBarProps) {
  const geminiOn = health?.llm?.configured ?? false;
  const model = health?.llm?.model?.replace("gemini-", "") ?? "flash";

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 md:py-3.5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-gradient-to-br from-muted/80 to-card shadow-sm sm:flex">
            <Store className="size-4 text-muted-foreground" strokeWidth={2} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <h1 className="truncate text-base font-bold tracking-tight text-foreground md:hidden">
                Razor<span className="text-recovery">Recover</span>
              </h1>

              <span className="hidden truncate text-[15px] font-semibold tracking-tight text-foreground md:inline">
                {merchantName}
              </span>

              <span className="hidden h-4 w-px bg-border md:inline-block" aria-hidden />

              <div className="flex flex-wrap items-center gap-1.5">
                <LiveStatus online={backendOnline} refreshing={refreshing} />
                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Test mode
                </span>
                {geminiOn && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-gemini-muted bg-gemini-muted/80 px-2.5 py-0.5 text-[11px] font-semibold text-gemini-foreground">
                    <Sparkles className="size-3" />
                    Gemini · {model}
                  </span>
                )}
              </div>
            </div>

            <p className="mt-1 hidden flex-wrap items-center gap-x-1.5 text-[11px] leading-relaxed text-muted-foreground sm:flex">
              {TAGLINE.map((part, i) => (
                <span key={part} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-border select-none">·</span>}
                  <span>{part}</span>
                </span>
              ))}
            </p>
          </div>
        </div>

        <div className="shrink-0 self-end md:self-auto">
          <DemoMenu busy={busy} onRun={onRunDemo} />
        </div>
      </div>
    </header>
  );
}
