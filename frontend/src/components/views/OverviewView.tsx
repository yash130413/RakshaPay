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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentMixCard } from "@/components/shared/AgentMixCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { HeroMetrics } from "@/components/shared/HeroMetrics";
import { JudgeQuickStart } from "@/components/shared/JudgeQuickStart";
import { PolicyLimitsCard } from "@/components/shared/PolicyLimitsCard";
import { SubmissionBanner } from "@/components/shared/SubmissionBanner";
import { SystemStatusBar } from "@/components/shared/SystemStatusBar";
import { formatInr } from "@/lib/format";
import { computeAgentMix } from "@/lib/submission";
import type { ApiHealth, RecoveryCase, SeriesPoint, Summary } from "@/lib/types";

type OverviewViewProps = {
  summary: Summary | null;
  chartData: (SeriesPoint & { label: string })[];
  cases: RecoveryCase[];
  health: ApiHealth | null;
  backendOnline: boolean;
  onOpenResearch?: () => void;
};

export function OverviewView({
  summary,
  chartData,
  cases,
  health,
  backendOnline,
  onOpenResearch,
}: OverviewViewProps) {
  const agentMix = computeAgentMix(cases);

  return (
    <div className="space-y-8">
      <SubmissionBanner onOpenResearch={onOpenResearch} />
      <SystemStatusBar health={health} backendOnline={backendOnline} />
      <HeroMetrics summary={summary} />

      <div className="grid gap-4 lg:grid-cols-2">
        <AgentMixCard mix={agentMix} />
        <JudgeQuickStart />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Revenue recovery</CardTitle>
            <CardDescription>Live cumulative failed inflow vs recovered INR (Neon DB)</CardDescription>
          </div>
          <Badge variant="muted">Live ledger</Badge>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <EmptyState
              title="No recovery data yet"
              body="Run a demo from the top bar — the chart fills as cases arrive."
            />
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height={280}>
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

      <PolicyLimitsCard />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">AI actions</CardTitle>
          <CardDescription>Recommended recovery actions taken by the agent (live DB)</CardDescription>
        </CardHeader>
        <CardContent>
          {(summary?.actions?.length ?? 0) === 0 ? (
            <EmptyState
              title="No AI actions yet"
              body="Run a demo scenario to see recommended actions."
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
    </div>
  );
}
