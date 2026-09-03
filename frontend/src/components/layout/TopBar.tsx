import { LogOut, Store, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoMenu } from "./DemoMenu";
import type { DemoScenario } from "@/lib/types";
import { cn } from "@/lib/utils";

type TopBarProps = {
  merchantName: string;
  backendOnline: boolean;
  refreshing?: boolean;
  busy: boolean;
  onRunDemo: (scenario: DemoScenario) => void;
  user?: { email: string; name: string; merchantName?: string } | null;
  onLogout?: () => void;
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
  refreshing = false,
  busy,
  onRunDemo,
  user,
  onLogout,
}: TopBarProps) {
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
                Raksha<span className="text-recovery">Pay</span>
              </h1>

              <span className="hidden truncate text-[15px] font-semibold tracking-tight text-foreground md:inline">
                {user?.merchantName || merchantName}
              </span>

              <span className="hidden h-4 w-px bg-border md:inline-block" aria-hidden />

              <div className="flex flex-wrap items-center gap-1.5">
                <LiveStatus online={backendOnline} refreshing={refreshing} />
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

        <div className="flex shrink-0 items-center gap-2 self-end md:self-auto">
          <DemoMenu busy={busy} onRun={onRunDemo} />

          {onLogout && (
            <div className="flex items-center gap-1.5 border-l border-border pl-2">
              <div
                title={user?.email || "Logged In"}
                className="hidden items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-foreground sm:flex"
              >
                <User className="size-3.5 text-muted-foreground" />
                <span className="max-w-[110px] truncate font-medium">
                  {user?.name || "Merchant"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                title="Sign out"
                className="h-9 px-2 text-muted-foreground hover:bg-muted hover:text-reject"
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
