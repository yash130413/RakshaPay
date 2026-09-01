import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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
const MERCHANT_NAME = "Demo Merchant";

export default function App() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [evaluation, setEvaluation] = useState<EvalSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch(`${API}/api/analytics/summary`).then((r) => r.json()),
      fetch(`${API}/api/recovery/cases`).then((r) => r.json()),
      fetch(`${API}/api/recovery/audit`).then((r) => r.json()),
      fetch(`${API}/api/analytics/series`).then((r) => r.json()),
      fetch(`${API}/api/analytics/evaluation`).then((r) => r.json()),
    ])
      .then(([s, c, a, ser, ev]) => {
        setSummary(s?.error ? null : s);
        setCases(Array.isArray(c) ? c : []);
        setAudits(Array.isArray(a) ? a : []);
        setSeries(Array.isArray(ser?.series) ? ser.series : []);
        setEvaluation(ev?.highlights ? ev : null);
        setError(null);
      })
      .catch(() => setError("Backend offline — start backend on :4000"));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

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

  async function triggerDemo(scenario: DemoScenario) {
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch(`${API}/api/recovery/demo/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Demo trigger failed");
      setToast(`${data.label} → status ${data.case?.status ?? "?"}`);
      if (data.case?.id) {
        setSelectedId(data.case.id);
        setActiveTab("cases");
      }
      load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Demo failed");
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
      setToast(`Recovered ₹${data.recoveredAmount}`);
      load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      merchantName={MERCHANT_NAME}
      backendOnline={!error}
      busy={busy}
      onRunDemo={triggerDemo}
    >
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {toast && (
        <Alert variant="success" className="mb-4">
          <AlertDescription>{toast}</AlertDescription>
        </Alert>
      )}

      {activeTab === "overview" && <OverviewView summary={summary} chartData={chartData} />}
      {activeTab === "cases" && (
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
      )}
      {activeTab === "audit" && (
        <AuditView audits={audits} selectedCaseId={selectedId} />
      )}
      {activeTab === "evaluation" && <EvaluationView evaluation={evaluation} />}
    </DashboardLayout>
  );
}
