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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

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
    <div className="rounded-lg border border-dashed border-border bg-muted/50 px-4 py-8 text-center">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "recovery" | "escalate" | "reject";
}) {
  const valueClass =
    tone === "recovery"
      ? "text-recovery"
      : tone === "escalate"
        ? "text-escalate"
        : tone === "reject"
          ? "text-reject"
          : "text-foreground";

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
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
    <div className="mx-auto max-w-6xl px-4 py-8 pb-14 sm:px-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">RazorRecover</h1>
          <Badge variant="live">● LIVE</Badge>
          <Badge variant="outline">Test Mode</Badge>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground text-balance">
          AI decides. Policy controls. Razorpay executes. Webhooks verify.
        </p>
      </header>

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

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Demo scenarios
          </CardTitle>
          <CardDescription>Policy paths — synthetic webhooks, real workflow + DB</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="recovery" disabled={busy} onClick={() => triggerDemo("full_recovery")}>
            Full recovery (fail → ₹ back)
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => triggerDemo("recoverable")}>
            Recoverable ₹2,499
          </Button>
          <Button variant="escalate" disabled={busy} onClick={() => triggerDemo("escalate")}>
            Escalate ₹30,000
          </Button>
          <Button variant="reject" disabled={busy} onClick={() => triggerDemo("reject")}>
            Reject ₹60,000
          </Button>
        </CardContent>
      </Card>

      <section className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="At Risk" value={formatInr(summary?.revenueAtRisk ?? 0)} />
        <MetricCard
          label="Recovered"
          value={formatInr(summary?.recovered ?? 0)}
          tone="recovery"
        />
        <MetricCard
          label="Recovery Rate"
          value={`${((summary?.recoveryRate ?? 0) * 100).toFixed(1)}%`}
        />
        <MetricCard label="Cases" value={summary?.totalCases ?? 0} />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Recovered cases" value={summary?.recoveredCases ?? 0} tone="recovery" />
        <MetricCard label="Escalated" value={summary?.escalatedCases ?? 0} tone="escalate" />
        <MetricCard label="Rejected" value={summary?.rejectedCases ?? 0} tone="reject" />
        <MetricCard
          label="AI actions"
          value={(summary?.actions ?? []).reduce((n, a) => n + a.count, 0)}
        />
      </section>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Held-out evaluation</CardTitle>
            <CardDescription className="mt-1">
              Offline experiment: blind retry baseline vs RazorRecover (rules + policy).
            </CardDescription>
          </div>
          <Badge variant="muted">
            {evaluation ? `${evaluation.split} · n=${evaluation.n}` : "loading…"}
          </Badge>
        </CardHeader>
        <CardContent>
          {!evaluation ? (
            <EmptyState
              title="Evaluation snapshot unavailable"
              body="Start the backend to load baseline vs RazorRecover metrics."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {evaluation.highlights.map((h) => (
                <div
                  key={h.label}
                  className="rounded-lg border border-border bg-muted/40 p-4"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {h.label}
                  </p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p>
                      <span className="text-xs uppercase text-muted-foreground">Baseline </span>
                      {h.baseline}
                    </p>
                    <p className="font-semibold text-recovery-foreground">
                      <span className="text-xs font-normal uppercase text-muted-foreground">
                        RazorRecover{" "}
                      </span>
                      {h.agent}
                    </p>
                  </div>
                  <p className="mt-2 text-sm font-bold text-recovery">{h.delta}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Revenue recovery</CardTitle>
          <Badge variant="muted">cumulative INR</Badge>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <EmptyState
              title="No recovery data yet"
              body="Run a demo scenario or send a payment.failed webhook — the chart fills as cases arrive."
            />
          ) : (
            <div className="h-[260px] w-full">
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
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>AI Actions</CardTitle>
        </CardHeader>
        <CardContent>
          {(summary?.actions?.length ?? 0) === 0 ? (
            <EmptyState
              title="No AI actions yet"
              body="Trigger Recoverable / Escalate / Reject above to see recommended actions."
            />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {summary!.actions.map((a) => (
                <li key={a.actionType}>
                  <Badge variant="secondary">
                    {a.actionType} — {a.count}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between space-y-0 gap-3">
            <CardTitle>Recovery Cases</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  "ALL",
                  "WAITING_FOR_WEBHOOK",
                  "RECOVERED",
                  "ESCALATED",
                  "REJECTED",
                ] as StatusFilter[]
              ).map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="pill"
                  variant={filter === f ? "default" : "outline"}
                  onClick={() => setFilter(f)}
                >
                  {f === "WAITING_FOR_WEBHOOK" ? "WAITING" : f}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
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
              <ul className="flex max-h-[560px] flex-col gap-3 overflow-auto">
                {filteredCases.slice(0, 20).map((c) => {
                  const latest = c.actions[c.actions.length - 1];
                  const shortUrl =
                    latest?.metadata &&
                    typeof latest.metadata === "object" &&
                    "shortUrl" in latest.metadata
                      ? (latest.metadata as { shortUrl?: string }).shortUrl
                      : undefined;
                  const source = agentSource(c.decisions);
                  const selected = selectedId === c.id;

                  return (
                    <li
                      key={c.id}
                      className={`cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:border-recovery ${
                        selected ? "border-recovery ring-1 ring-recovery/30" : "border-border"
                      }`}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-base">{formatInr(c.amount / 100)}</strong>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {c.diagnosis ?? "—"} → {c.recommendedAction ?? "—"}
                        {c.failureReason ? ` (${c.failureReason})` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {source && (
                          <Badge variant={source === "gemini" ? "gemini" : "rules"}>
                            {source}
                          </Badge>
                        )}
                        {c.status === "ESCALATED" && (
                          <Badge variant="escalate">needs human</Badge>
                        )}
                        {c.status === "REJECTED" && (
                          <Badge variant="reject">policy blocked</Badge>
                        )}
                      </div>
                      {shortUrl && (
                        <a
                          href={shortUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-sm text-brand hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open recovery link
                        </a>
                      )}
                      {c.status === "RECOVERED" && (
                        <p className="mt-1 text-sm font-semibold text-recovery">
                          Recovered {formatInr(c.recoveredAmount / 100)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Case Detail</CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <EmptyState
                title="No case selected"
                body="Click a recovery case to inspect Gemini/rules decisions, policy outcome, and the case audit trail."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-lg">{formatInr(selected.amount / 100)}</strong>
                  <StatusBadge status={selected.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {selected.failureReason ?? "no failure reason"} · created{" "}
                  {formatTime(selected.createdAt)}
                </p>

                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    AI decisions
                  </h3>
                  {(selected.decisions?.length ?? 0) === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">No decisions stored.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {selected.decisions!.map((d) => (
                        <li
                          key={d.id}
                          className="rounded-lg border border-border bg-muted/40 p-3 text-sm"
                        >
                          <span className="block font-mono text-xs text-muted-foreground">
                            {d.agent}
                          </span>
                          <span>
                            {d.diagnosis ?? d.recommendedAction ?? "—"}
                            {d.confidence != null
                              ? ` (${(d.confidence * 100).toFixed(0)}%)`
                              : ""}
                          </span>
                          {d.reason && (
                            <p className="mt-1 text-xs text-muted-foreground">{d.reason}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {selected.expectedRecoveryProbability != null && (
                  <p className="text-sm text-muted-foreground">
                    Expected recovery:{" "}
                    {(selected.expectedRecoveryProbability * 100).toFixed(0)}%
                  </p>
                )}

                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Case audit
                  </h3>
                  {(selected.audits?.length ?? 0) === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">No audit events for this case.</p>
                  ) : (
                    <ol className="mt-2 max-h-[280px] space-y-1 overflow-auto">
                      {selected.audits!.map((a) => (
                        <li
                          key={a.id}
                          className="grid gap-1 rounded-md px-2 py-1.5 text-sm sm:grid-cols-[5.5rem_11rem_1fr]"
                        >
                          <span className="tabular-nums text-muted-foreground">
                            {formatTime(a.createdAt)}
                          </span>
                          <span className="font-mono text-xs text-recovery">{a.eventType}</span>
                          <span className="text-foreground">{a.message}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {selected.status === "WAITING_FOR_WEBHOOK" && (
                  <Button disabled={busy} onClick={() => simulateCapture(selected.id)}>
                    Simulate payment.captured
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Audit Trail</CardTitle>
            <CardDescription className="mt-1">
              Immutable log — detect → diagnose → policy → execute → verify.
            </CardDescription>
          </div>
          <Badge variant="muted">{audits.length} events</Badge>
        </CardHeader>
        <CardContent>
          {audits.length === 0 ? (
            <EmptyState
              title="Audit trail is empty"
              body="Every webhook and policy decision will appear here once the first case runs."
            />
          ) : (
            <ol className="max-h-[360px] space-y-1 overflow-auto">
              {audits.slice(0, 40).map((a) => (
                <li
                  key={a.id}
                  className={`grid gap-1 rounded-md px-2 py-1.5 text-sm sm:grid-cols-[5.5rem_11rem_1fr] ${
                    a.recoveryCaseId && a.recoveryCaseId === selectedId
                      ? "bg-accent"
                      : undefined
                  }`}
                >
                  <span className="tabular-nums text-muted-foreground">
                    {formatTime(a.createdAt)}
                  </span>
                  <span className="font-mono text-xs text-recovery">{a.eventType}</span>
                  <span className="text-foreground">{a.message}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        Razorpay Test Mode · AI decides. Policy controls. Razorpay executes. Webhooks verify.
      </footer>
    </div>
  );
}
