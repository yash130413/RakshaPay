import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

type Summary = {
  revenueAtRisk: number;
  recovered: number;
  recoveryRate: number;
  totalCases: number;
  escalatedCases?: number;
  rejectedCases?: number;
  recoveredCases?: number;
  actions: { actionType: string; count: number }[];
};

type Decision = {
  id: string;
  agent: string;
  diagnosis: string | null;
  confidence: number | null;
  recommendedAction: string | null;
  reason: string | null;
  rawJson: { source?: string } | null;
};

type AuditLog = {
  id: string;
  recoveryCaseId: string | null;
  eventType: string;
  message: string;
  createdAt: string;
};

type RecoveryCase = {
  id: string;
  amount: number;
  status: string;
  failureReason: string | null;
  diagnosis: string | null;
  recommendedAction: string | null;
  expectedRecoveryProbability: number | null;
  recoveredAmount: number;
  createdAt: string;
  decisions?: Decision[];
  actions: {
    actionType: string;
    status: string;
    policyDecision?: string;
    razorpayRefId: string | null;
    metadata: { shortUrl?: string; message?: string } | null;
  }[];
  audits?: AuditLog[];
};

type StatusFilter = "ALL" | "WAITING_FOR_WEBHOOK" | "RECOVERED" | "ESCALATED" | "REJECTED";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function agentSource(decisions?: Decision[]) {
  const src = decisions?.map((d) => d.rawJson?.source ?? d.agent).filter(Boolean);
  if (!src?.length) return null;
  if (src.some((s) => String(s).includes("gemini"))) return "gemini";
  if (src.some((s) => String(s).includes("rules"))) return "rules";
  return null;
}

export default function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
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
    ])
      .then(([s, c, a]) => {
        setSummary(s);
        setCases(Array.isArray(c) ? c : []);
        setAudits(Array.isArray(a) ? a : []);
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

  async function triggerDemo(scenario: "recoverable" | "escalate" | "reject") {
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
      if (data.case?.id) setSelectedId(data.case.id);
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
    <div className="app">
      <header className="header">
        <h1>RazorRecover</h1>
        <span className="live">● LIVE</span>
      </header>

      <p className="tagline">
        AI decides. Policy controls. Razorpay executes. Webhooks verify.
      </p>

      {error && <p className="error">{error}</p>}
      {toast && <p className="toast">{toast}</p>}

      <section className="demo-bar">
        <p className="demo-label">Demo scenarios (policy paths)</p>
        <div className="demo-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => triggerDemo("recoverable")}
          >
            Recoverable ₹2,499
          </button>
          <button
            type="button"
            className="warn"
            disabled={busy}
            onClick={() => triggerDemo("escalate")}
          >
            Escalate ₹30,000
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => triggerDemo("reject")}
          >
            Reject ₹60,000
          </button>
        </div>
      </section>

      <section className="metrics">
        <div>
          <p className="label">At Risk</p>
          <p className="value">{formatInr(summary?.revenueAtRisk ?? 0)}</p>
        </div>
        <div>
          <p className="label">Recovered</p>
          <p className="value recovered">
            {formatInr(summary?.recovered ?? 0)}
          </p>
        </div>
        <div>
          <p className="label">Recovery Rate</p>
          <p className="value">
            {((summary?.recoveryRate ?? 0) * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="label">Cases</p>
          <p className="value">{summary?.totalCases ?? 0}</p>
        </div>
      </section>

      <section className="metrics mini">
        <div>
          <p className="label">Recovered cases</p>
          <p className="value sm">{summary?.recoveredCases ?? 0}</p>
        </div>
        <div>
          <p className="label">Escalated</p>
          <p className="value sm escalate">{summary?.escalatedCases ?? 0}</p>
        </div>
        <div>
          <p className="label">Rejected</p>
          <p className="value sm reject">{summary?.rejectedCases ?? 0}</p>
        </div>
        <div>
          <p className="label">AI actions</p>
          <p className="value sm">
            {(summary?.actions ?? []).reduce((n, a) => n + a.count, 0)}
          </p>
        </div>
      </section>

      <section className="panel">
        <h2>AI Actions</h2>
        {(summary?.actions?.length ?? 0) === 0 ? (
          <p className="muted">No actions yet — run a demo scenario above.</p>
        ) : (
          <ul className="action-chips">
            {summary!.actions.map((a) => (
              <li key={a.actionType}>
                {a.actionType} — {a.count}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid-2">
        <section className="panel cases">
          <div className="panel-head">
            <h2>Recovery Cases</h2>
            <div className="filters">
              {(
                [
                  "ALL",
                  "WAITING_FOR_WEBHOOK",
                  "RECOVERED",
                  "ESCALATED",
                  "REJECTED",
                ] as StatusFilter[]
              ).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={filter === f ? "filter active" : "filter"}
                  onClick={() => setFilter(f)}
                >
                  {f === "WAITING_FOR_WEBHOOK" ? "WAITING" : f}
                </button>
              ))}
            </div>
          </div>

          {filteredCases.length === 0 ? (
            <p className="muted">No cases for this filter.</p>
          ) : (
            <ul className="case-list">
              {filteredCases.slice(0, 20).map((c) => {
                const latest = c.actions[c.actions.length - 1];
                const shortUrl =
                  latest?.metadata &&
                  typeof latest.metadata === "object" &&
                  "shortUrl" in latest.metadata
                    ? (latest.metadata as { shortUrl?: string }).shortUrl
                    : undefined;
                const source = agentSource(c.decisions);

                return (
                  <li
                    key={c.id}
                    className={
                      selectedId === c.id ? "case-item selected" : "case-item"
                    }
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="case-top">
                      <strong>{formatInr(c.amount / 100)}</strong>
                      <span className={`badge status-${c.status}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="case-meta">
                      {c.diagnosis ?? "—"} → {c.recommendedAction ?? "—"}
                      {c.failureReason ? ` (${c.failureReason})` : ""}
                    </p>
                    <div className="case-tags">
                      {source && (
                        <span className={`tag source-${source}`}>{source}</span>
                      )}
                      {c.status === "ESCALATED" && (
                        <span className="tag escalate-tag">needs human</span>
                      )}
                      {c.status === "REJECTED" && (
                        <span className="tag reject-tag">policy blocked</span>
                      )}
                    </div>
                    {shortUrl && (
                      <a
                        href={shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open recovery link
                      </a>
                    )}
                    {c.status === "RECOVERED" && (
                      <p className="recovered-line">
                        Recovered {formatInr(c.recoveredAmount / 100)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel detail">
          <h2>Case Detail</h2>
          {!selected ? (
            <p className="muted">Select a case to inspect AI decisions, policy, and audit.</p>
          ) : (
            <div className="detail-body">
              <div className="case-top">
                <strong>{formatInr(selected.amount / 100)}</strong>
                <span className={`badge status-${selected.status}`}>
                  {selected.status}
                </span>
              </div>
              <p className="case-meta">
                {selected.failureReason ?? "no failure reason"} · created{" "}
                {formatTime(selected.createdAt)}
              </p>

              <h3>AI decisions</h3>
              {(selected.decisions?.length ?? 0) === 0 ? (
                <p className="muted">No decisions stored.</p>
              ) : (
                <ul className="decision-list">
                  {selected.decisions!.map((d) => (
                    <li key={d.id}>
                      <span className="mono">{d.agent}</span>
                      <span>
                        {d.diagnosis ?? d.recommendedAction ?? "—"}
                        {d.confidence != null
                          ? ` (${(d.confidence * 100).toFixed(0)}%)`
                          : ""}
                      </span>
                      {d.reason && <p className="muted small">{d.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}

              {selected.expectedRecoveryProbability != null && (
                <p className="case-meta">
                  Expected recovery:{" "}
                  {(selected.expectedRecoveryProbability * 100).toFixed(0)}%
                </p>
              )}

              <h3>Case audit</h3>
              <ol className="timeline">
                {(selected.audits ?? []).map((a) => (
                  <li key={a.id}>
                    <span className="time">{formatTime(a.createdAt)}</span>
                    <span className="evt">{a.eventType}</span>
                    <span className="msg">{a.message}</span>
                  </li>
                ))}
              </ol>

              {selected.status === "WAITING_FOR_WEBHOOK" && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => simulateCapture(selected.id)}
                >
                  Simulate payment.captured
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="panel audit-panel">
        <h2>Audit Trail</h2>
        <p className="muted small">
          Immutable event log — every detect → diagnose → policy → execute → verify step.
        </p>
        {audits.length === 0 ? (
          <p className="muted">No audit events yet.</p>
        ) : (
          <ol className="timeline global">
            {audits.slice(0, 40).map((a) => (
              <li
                key={a.id}
                className={
                  a.recoveryCaseId && a.recoveryCaseId === selectedId
                    ? "highlight"
                    : undefined
                }
              >
                <span className="time">{formatTime(a.createdAt)}</span>
                <span className="evt">{a.eventType}</span>
                <span className="msg">{a.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
