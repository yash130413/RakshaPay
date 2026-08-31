import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

type SeriesPoint = {
  date: string;
  failedInr: number;
  recoveredInr: number;
  cumulativeFailedInr: number;
  cumulativeRecoveredInr: number;
};

type EvalSnapshot = {
  n: number;
  split: string;
  highlights: { label: string; baseline: string; agent: string; delta: string }[];
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

function shortDate(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function agentSource(decisions?: Decision[]) {
  const src = decisions?.map((d) => d.rawJson?.source ?? d.agent).filter(Boolean);
  if (!src?.length) return null;
  if (src.some((s) => String(s).includes("gemini"))) return "gemini";
  if (src.some((s) => String(s).includes("rules"))) return "rules";
  return null;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      <p className="muted">{body}</p>
    </div>
  );
}

export default function App() {
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
        setSummary(s);
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

  async function triggerDemo(
    scenario: "recoverable" | "escalate" | "reject" | "full_recovery"
  ) {
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
        <div>
          <div className="header-row">
            <h1>RazorRecover</h1>
            <span className="live">● LIVE</span>
          </div>
          <p className="tagline">
            AI decides. Policy controls. Razorpay executes. Webhooks verify.
          </p>
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {toast && <p className="toast">{toast}</p>}

      <section className="demo-bar">
        <p className="demo-label">Demo scenarios (policy paths)</p>
        <div className="demo-actions">
          <button
            type="button"
            className="primary-outline"
            disabled={busy}
            onClick={() => triggerDemo("full_recovery")}
          >
            Full recovery (fail → ₹ back)
          </button>
          <button type="button" disabled={busy} onClick={() => triggerDemo("recoverable")}>
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
          <p className="value recovered">{formatInr(summary?.recovered ?? 0)}</p>
        </div>
        <div>
          <p className="label">Recovery Rate</p>
          <p className="value">{((summary?.recoveryRate ?? 0) * 100).toFixed(1)}%</p>
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

      <section className="panel eval-strip">
        <div className="panel-head">
          <h2>Held-out evaluation</h2>
          <span className="pill">
            {evaluation ? `${evaluation.split} · n=${evaluation.n}` : "loading…"}
          </span>
        </div>
        {!evaluation ? (
          <EmptyState
            title="Evaluation snapshot unavailable"
            body="Start the backend to load baseline vs RazorRecover metrics."
          />
        ) : (
          <>
            <p className="muted small">
              Offline experiment: blind retry baseline vs RazorRecover (rules + policy).
            </p>
            <div className="eval-grid">
              {evaluation.highlights.map((h) => (
                <div key={h.label} className="eval-card">
                  <p className="label">{h.label}</p>
                  <div className="eval-row">
                    <span>
                      <em>Baseline</em> {h.baseline}
                    </span>
                    <span className="agent">
                      <em>RazorRecover</em> {h.agent}
                    </span>
                  </div>
                  <p className="delta">{h.delta}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="panel chart-panel">
        <div className="panel-head">
          <h2>Revenue recovery</h2>
          <span className="pill">cumulative INR</span>
        </div>
        {chartData.length === 0 ? (
          <EmptyState
            title="No recovery data yet"
            body="Run a demo scenario or send a payment.failed webhook — the chart fills as cases arrive."
          />
        ) : (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="failedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="recoveredFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  tickFormatter={(v) =>
                    v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${Math.round(v / 1000)}k`
                  }
                />
                <Tooltip
                  formatter={(value) => formatInr(Number(value ?? 0))}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="cumulativeFailedInr"
                  name="Failed (at risk inflow)"
                  stroke="#64748b"
                  fill="url(#failedFill)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeRecoveredInr"
                  name="Recovered"
                  stroke="#059669"
                  fill="url(#recoveredFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>AI Actions</h2>
        {(summary?.actions?.length ?? 0) === 0 ? (
          <EmptyState
            title="No AI actions yet"
            body="Trigger Recoverable / Escalate / Reject above to see recommended actions."
          />
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

          {cases.length === 0 ? (
            <EmptyState
              title="No recovery cases"
              body="Your merchant ledger is empty. Run a demo scenario to create the first case."
            />
          ) : filteredCases.length === 0 ? (
            <EmptyState
              title={`No ${filter === "ALL" ? "" : filter.toLowerCase()} cases`}
              body="Try another filter, or run Escalate / Reject demos to populate those states."
            />
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
                    className={selectedId === c.id ? "case-item selected" : "case-item"}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="case-top">
                      <strong>{formatInr(c.amount / 100)}</strong>
                      <span className={`badge status-${c.status}`}>{c.status}</span>
                    </div>
                    <p className="case-meta">
                      {c.diagnosis ?? "—"} → {c.recommendedAction ?? "—"}
                      {c.failureReason ? ` (${c.failureReason})` : ""}
                    </p>
                    <div className="case-tags">
                      {source && <span className={`tag source-${source}`}>{source}</span>}
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
            <EmptyState
              title="No case selected"
              body="Click a recovery case to inspect Gemini/rules decisions, policy outcome, and the case audit trail."
            />
          ) : (
            <div className="detail-body">
              <div className="case-top">
                <strong>{formatInr(selected.amount / 100)}</strong>
                <span className={`badge status-${selected.status}`}>{selected.status}</span>
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
              {(selected.audits?.length ?? 0) === 0 ? (
                <p className="muted">No audit events for this case.</p>
              ) : (
                <ol className="timeline">
                  {selected.audits!.map((a) => (
                    <li key={a.id}>
                      <span className="time">{formatTime(a.createdAt)}</span>
                      <span className="evt">{a.eventType}</span>
                      <span className="msg">{a.message}</span>
                    </li>
                  ))}
                </ol>
              )}

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
        <div className="panel-head">
          <h2>Audit Trail</h2>
          <span className="pill">{audits.length} events</span>
        </div>
        <p className="muted small">
          Immutable log — detect → diagnose → policy → execute → verify.
        </p>
        {audits.length === 0 ? (
          <EmptyState
            title="Audit trail is empty"
            body="Every webhook and policy decision will appear here once the first case runs."
          />
        ) : (
          <ol className="timeline global">
            {audits.slice(0, 40).map((a) => (
              <li
                key={a.id}
                className={
                  a.recoveryCaseId && a.recoveryCaseId === selectedId ? "highlight" : undefined
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
