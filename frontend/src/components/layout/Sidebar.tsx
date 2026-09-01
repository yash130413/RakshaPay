import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardTab } from "@/lib/types";

const NAV_ITEMS: { id: DashboardTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "cases", label: "Cases", icon: ClipboardList },
  { id: "audit", label: "Audit", icon: ScrollText },
  { id: "evaluation", label: "Research", icon: BarChart3 },
];

type SidebarProps = {
  active: DashboardTab;
  onChange: (tab: DashboardTab) => void;
};

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border px-5 py-5">
          <p className="text-lg font-bold tracking-tight text-foreground">RazorRecover</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Track 03 · AI recovery agent</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active === id
                  ? "bg-accent text-recovery-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
        <div className="border-t border-border p-4 text-xs text-muted-foreground">
          Razorpay Test Mode
        </div>
      </aside>

      <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2 md:hidden">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium",
              active === id
                ? "bg-accent text-recovery-foreground"
                : "text-muted-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
