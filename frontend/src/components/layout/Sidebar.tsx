import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  ScrollText,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DashboardTab } from "@/lib/types";

const NAV_ITEMS: { id: DashboardTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "cases", label: "Cases", icon: ClipboardList },
  { id: "audit", label: "Audit", icon: ScrollText },
  { id: "evaluation", label: "Research", icon: BarChart3 },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", compact && "gap-2")}>
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-recovery via-recovery to-brand shadow-md shadow-recovery/25 ring-1 ring-recovery/20",
          compact ? "size-8 rounded-lg" : "size-10"
        )}
      >
        <TrendingUp className={cn("text-white", compact ? "size-4" : "size-[18px]")} strokeWidth={2.5} />
        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-recovery" />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "font-bold tracking-tight text-foreground",
            compact ? "text-sm leading-none" : "text-[17px] leading-tight"
          )}
        >
          Raksha<span className="text-recovery">Pay</span>
        </p>
        {!compact && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="h-5 border-recovery/25 bg-recovery-muted/50 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-recovery-foreground"
            >
              Track 03
            </Badge>
            <span className="text-[11px] leading-none text-muted-foreground">AI recovery agent</span>
          </div>
        )}
      </div>
    </div>
  );
}

type SidebarProps = {
  active: DashboardTab;
  onChange: (tab: DashboardTab) => void;
};

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <>
      <aside className="hidden h-svh w-[15.5rem] shrink-0 flex-col overflow-hidden border-r border-border bg-card md:flex">
        <div className="shrink-0 border-b border-border bg-gradient-to-br from-accent/70 via-card to-card px-4 py-5">
          <BrandMark />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Navigation
          </p>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(id)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-accent text-recovery-foreground shadow-sm shadow-recovery/10"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full transition-opacity",
                    isActive ? "bg-recovery opacity-100" : "opacity-0 group-hover:opacity-40"
                  )}
                />
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    isActive ? "text-recovery" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                {label}
              </button>
            );
          })}
        </nav>

        {active !== "evaluation" && (
          <div className="shrink-0 border-t border-border p-3">
            <button
              type="button"
              onClick={() => onChange("evaluation")}
              className="group flex w-full items-center justify-between rounded-lg border border-recovery/20 bg-accent/40 px-3 py-2.5 text-left transition-colors hover:bg-accent/70"
            >
              <span>
                <span className="block text-xs font-semibold text-recovery-foreground">
                  Held-out eval
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  49.3% → 68.6% recovery
                </span>
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-recovery transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}
      </aside>

      <div className="border-b border-border bg-card md:hidden">
        <div className="border-b border-border/60 bg-gradient-to-r from-accent/60 to-card px-3 py-2.5">
          <BrandMark compact />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 py-2">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                active === id
                  ? "bg-accent text-recovery-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
