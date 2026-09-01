import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { DashboardTab, DemoScenario } from "@/lib/types";

type DashboardLayoutProps = {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  merchantName: string;
  backendOnline: boolean;
  refreshing?: boolean;
  busy: boolean;
  onRunDemo: (scenario: DemoScenario) => void;
  children: ReactNode;
};

export function DashboardLayout({
  activeTab,
  onTabChange,
  merchantName,
  backendOnline,
  refreshing = false,
  busy,
  onRunDemo,
  children,
}: DashboardLayoutProps) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <Sidebar active={activeTab} onChange={onTabChange} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          merchantName={merchantName}
          backendOnline={backendOnline}
          refreshing={refreshing}
          busy={busy}
          onRunDemo={onRunDemo}
        />
        <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
        <footer className="border-t border-border bg-card/50 px-4 py-3 text-center text-[11px] text-muted-foreground md:px-6">
          Razorpay Test Mode · AI decides. Policy controls. Razorpay executes. Webhooks verify.
        </footer>
      </div>
    </div>
  );
}
