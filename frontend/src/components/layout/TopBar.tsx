import { LogOut, Radio, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoMenu } from "./DemoMenu";
import type { DemoScenario } from "@/lib/types";
import { cn } from "@/lib/utils";

type TopBarProps = {
  merchantName?: string;
  backendOnline: boolean;
  refreshing?: boolean;
  busy: boolean;
  onRunDemo: (scenario: DemoScenario) => void;
  user?: { email: string; name: string; merchantName?: string } | null;
  onLogout?: () => void;
};

function EnhancedLiveStatus({ online, refreshing }: { online: boolean; refreshing: boolean }) {
  if (!online) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-reject/30 bg-reject/10 px-3 py-1 shadow-sm transition-all">
        <span className="size-2 rounded-full bg-reject" />
        <span className="text-xs font-semibold uppercase tracking-wider text-reject">Offline</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-recovery/25 bg-gradient-to-r from-recovery/10 via-recovery/5 to-emerald-500/10 px-3.5 py-1 shadow-sm ring-1 ring-recovery/15 backdrop-blur-sm transition-all hover:bg-recovery/15">
      <span className="relative flex size-2.5 items-center justify-center">
        {!refreshing && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-recovery opacity-75 duration-1000" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full bg-recovery shadow-sm shadow-recovery/50",
            refreshing && "animate-pulse"
          )}
        />
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-recovery">
          {refreshing ? "Syncing" : "LIVE"}
        </span>
        <Radio className={cn("size-3 text-recovery/70", !refreshing && "animate-pulse")} />
      </div>
    </div>
  );
}

export function TopBar({
  backendOnline,
  refreshing = false,
  busy,
  onRunDemo,
  user,
  onLogout,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-3.5">
        {/* Left: Enhanced Live indicator */}
        <div className="flex items-center gap-3">
          <EnhancedLiveStatus online={backendOnline} refreshing={refreshing} />
        </div>

        {/* Right: Actions */}
        <div className="flex shrink-0 items-center gap-2">
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
