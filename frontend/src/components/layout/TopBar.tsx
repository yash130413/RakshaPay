import { Badge } from "@/components/ui/badge";
import { DemoMenu } from "./DemoMenu";
import type { ApiHealth, DemoScenario } from "@/lib/types";

type TopBarProps = {
  merchantName: string;
  backendOnline: boolean;
  health: ApiHealth | null;
  refreshing?: boolean;
  busy: boolean;
  onRunDemo: (scenario: DemoScenario) => void;
};

export function TopBar({
  merchantName,
  backendOnline,
  health,
  refreshing = false,
  busy,
  onRunDemo,
}: TopBarProps) {
  const geminiOn = health?.llm?.configured ?? false;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-base font-semibold text-foreground md:hidden">
              RazorRecover
            </h1>
            <span className="hidden text-sm text-muted-foreground md:inline">/</span>
            <span className="truncate text-sm font-medium text-foreground">{merchantName}</span>
            <Badge variant={backendOnline ? "live" : "reject"}>
              {backendOnline ? (refreshing ? "↻ Syncing" : "● LIVE") : "OFFLINE"}
            </Badge>
            <Badge variant="outline">Test Mode</Badge>
            {geminiOn && (
              <Badge variant="gemini" className="hidden sm:inline-flex">
                Gemini active
              </Badge>
            )}
          </div>
          <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
            AI decides. Policy controls. Razorpay executes. Webhooks verify.
          </p>
        </div>
        <DemoMenu busy={busy} onRun={onRunDemo} />
      </div>
    </header>
  );
}
