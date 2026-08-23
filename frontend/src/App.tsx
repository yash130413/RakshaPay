import { useEffect, useState } from "react";
import "./App.css";

type Summary = {
  revenueAtRisk: number;
  recovered: number;
  recoveryRate: number;
  totalCases: number;
  actions: { actionType: string; count: number }[];
};

type RecoveryCase = {
  id: string;
  amount: number;
  status: string;
  failureReason: string | null;
  diagnosis: string | null;
  recommendedAction: string | null;
  recoveredAmount: number;
  createdAt: string;
  actions: {
    actionType: string;
    status: string;
    razorpayRefId: string | null;
    metadata: { shortUrl?: string; message?: string } | null;
  }[];
};

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      Promise.all([
        fetch(`${API}/api/analytics/summary`).then((r) => r.json()),
        fetch(`${API}/api/recovery/cases`).then((r) => r.json()),
      ])
        .then(([s, c]) => {
          setSummary(s);
          setCases(Array.isArray(c) ? c : []);
          setError(null);
        })
        .catch(() => setError("Backend offline — start backend on :4000"));
    };

    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

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

      <section className="panel">
        <h2>AI Actions</h2>
        {(summary?.actions?.length ?? 0) === 0 ? (
          <p className="muted">No actions yet — send a payment.failed webhook.</p>
        ) : (
          <ul>
            {summary!.actions.map((a) => (
              <li key={a.actionType}>
                {a.actionType} — {a.count}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel cases">
        <h2>Recovery Cases</h2>
        {cases.length === 0 ? (
          <p className="muted">No cases yet.</p>
        ) : (
          <ul className="case-list">
            {cases.slice(0, 10).map((c) => {
              const latest = c.actions[c.actions.length - 1];
              const shortUrl =
                latest?.metadata &&
                typeof latest.metadata === "object" &&
                "shortUrl" in latest.metadata
                  ? (latest.metadata as { shortUrl?: string }).shortUrl
                  : undefined;

              return (
                <li key={c.id} className="case-item">
                  <div className="case-top">
                    <strong>{formatInr(c.amount / 100)}</strong>
                    <span className={`badge status-${c.status}`}>{c.status}</span>
                  </div>
                  <p className="case-meta">
                    {c.diagnosis ?? "—"} → {c.recommendedAction ?? "—"}
                    {c.failureReason ? ` (${c.failureReason})` : ""}
                  </p>
                  {shortUrl && (
                    <a href={shortUrl} target="_blank" rel="noreferrer">
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
    </div>
  );
}
