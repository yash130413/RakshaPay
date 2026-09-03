import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LoginPage } from "@/components/auth/LoginPage";
import { ToastContainer, useToast } from "@/components/shared/Toast";
import {
  AuditSkeleton,
  CasesSkeleton,
  EvaluationSkeleton,
  OverviewSkeleton,
} from "@/components/shared/ViewSkeletons";
import { AuditView } from "@/components/views/AuditView";
import { CasesView } from "@/components/views/CasesView";
import { EvaluationView } from "@/components/views/EvaluationView";
import { OverviewView } from "@/components/views/OverviewView";
import { shortDate } from "@/lib/format";
import type {
  AuditLog,
  DashboardTab,
  DemoScenario,
  EvalSnapshot,
  RecoveryCase,
  SeriesPoint,
  StatusFilter,
  Summary,
} from "@/lib/types";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const DEFAULT_MERCHANT_NAME = "Yash Rohilla";

type AuthUser = {
  id?: string;
  email: string;
  name: string;
  merchantName: string;
};

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem("rakshapay_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [evaluation, setEvaluation] = useState<EvalSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toasts, show: showToast, dismiss: dismissToast } = useToast();

  const load = useCallback((isPoll = false) => {
    if (isPoll) setRefreshing(true);

    Promise.all([
      fetch(`${API}/health`).then((r) => r.json()),
      fetch(`${API}/api/analytics/summary`).then((r) => r.json()),
      fetch(`${API}/api/recovery/cases`).then((r) => r.json()),
      fetch(`${API}/api/recovery/audit`).then((r) => r.json()),
      fetch(`${API}/api/analytics/series`).then((r) => r.json()),
      fetch(`${API}/api/analytics/evaluation`).then((r) => r.json()),
    ])
      .then(([_h, s, c, a, ser, ev]) => {
        setSummary(s?.error ? null : s);
        setCases(Array.isArray(c) ? c : []);
        setAudits(Array.isArray(a) ? a : []);
        setSeries(Array.isArray(ser?.series) ? ser.series : []);
        setEvaluation(ev?.highlights ? ev : null);
        setError(null);
      })
      .catch(() => {
        setError("Backend offline — start backend on :4000");
      })
      .finally(() => {
        setInitialLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    load(false);
    const id = setInterval(() => load(true), 5000);
    return () => clearInterval(id);
  }, [load, user]);

  const handleLogin = (newUser: AuthUser) => {
    setUser(newUser);
    try {
      localStorage.setItem("rakshapay_user", JSON.stringify(newUser));
    } catch {
      // ignore
    }
    showToast(`Welcome back, ${newUser.name}!`, "success");
  };

  const handleLogout = () => {
    setUser(null);
    try {
      localStorage.removeItem("rakshapay_user");
    } catch {
      // ignore
    }
    showToast("Signed out of RakshaPay terminal", "success");
  };

  const filteredCases = useMemo(() => {
    if (filter === "ALL") return cases;
    return cases.filter((c) => c.status === filter);
  }, [cases, filter]);

  const selected = useMemo(
    () => cases.find((c) => c.id === selectedId) ?? null,
    [cases, selectedId]
  );

  const chartData = useMemo(
    () =>
      series.map((p) => ({
        ...p,
        label: shortDate(p.date),
      })),
    [series]
  );

  const hasData = summary !== null || cases.length > 0;
  const backendOnline = !error;

  async function triggerDemo(scenario: DemoScenario) {
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/recovery/demo/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Demo trigger failed");
      showToast(`${data.label} → ${data.case?.status ?? "?"}`, "success");
      if (data.case?.id) {
        setSelectedId(data.case.id);
        setActiveTab("cases");
      }
      load(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Demo failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function simulateCapture(caseId: string) {
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/recovery/cases/${caseId}/simulate-capture`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Capture failed");
      showToast(`Recovered ₹${data.recoveredAmount}`, "success");
      load(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Capture failed", "error");
    } finally {
      setBusy(false);
    }
  }

  // If not logged in, show the login view
  if (!user) {
    return (
      <>
        <LoginPage onLogin={handleLogin} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  function renderActiveView() {
    if (initialLoading && !hasData) {
      switch (activeTab) {
        case "cases":
          return <CasesSkeleton />;
        case "audit":
          return <AuditSkeleton />;
        case "evaluation":
          return <EvaluationSkeleton />;
        default:
          return <OverviewSkeleton />;
      }
    }

    switch (activeTab) {
      case "overview":
        return (
          <OverviewView
            summary={summary}
            chartData={chartData}
            cases={cases}
            onOpenResearch={() => setActiveTab("evaluation")}
          />
        );
      case "cases":
        return (
          <CasesView
            cases={cases}
            filteredCases={filteredCases}
            filter={filter}
            onFilterChange={setFilter}
            selected={selected}
            selectedId={selectedId}
            onSelectCase={setSelectedId}
            onCloseCase={() => setSelectedId(null)}
            busy={busy}
            onSimulateCapture={simulateCapture}
          />
        );
      case "audit":
        return <AuditView audits={audits} selectedCaseId={selectedId} />;
      case "evaluation":
        return <EvaluationView evaluation={evaluation} />;
    }
  }

  return (
    <>
      <DashboardLayout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        merchantName={user.merchantName || DEFAULT_MERCHANT_NAME}
        backendOnline={backendOnline}
        refreshing={refreshing}
        busy={busy}
        onRunDemo={triggerDemo}
        user={user}
        onLogout={handleLogout}
      >
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {renderActiveView()}
      </DashboardLayout>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
