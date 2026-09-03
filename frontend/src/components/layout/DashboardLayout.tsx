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
  user?: { email: string; name: string; merchantName?: string } | null;
  onLogout?: () => void;
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
  user,
  onLogout,
  children,
}: DashboardLayoutProps) {
  return (
    <div className="flex h-svh flex-col overflow-hidden md:flex-row">
      <Sidebar active={activeTab} onChange={onTabChange} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          merchantName={merchantName}
          backendOnline={backendOnline}
          refreshing={refreshing}
          busy={busy}
          onRunDemo={onRunDemo}
          user={user}
          onLogout={onLogout}
        />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
