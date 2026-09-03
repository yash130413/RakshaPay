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
import { formatInr } from "@/lib/format";
import { computeAgentMix } from "@/lib/submission";
import type { RecoveryCase, SeriesPoint, Summary } from "@/lib/types";
import { LineChart, Sparkles } from "lucide-react";

type OverviewViewProps = {
  summary: Summary | null;
  chartData: (SeriesPoint & { label: string })[];
  cases: RecoveryCase[];
  onOpenResearch?: () => void;
};

export function OverviewView({
  summary,
  chartData,
  cases,
  onOpenResearch,
}: OverviewViewProps) {
  const agentMix = computeAgentMix(cases);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <SubmissionBanner onOpenResearch={onOpenResearch} />

      {/* KPI Metrics */}
      <HeroMetrics summary={summary} />

      {/* Main Cumulative Recovery Trajectory Chart */}
      <Card className="border-border/80 shadow-sm transition-all hover:border-border">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-muted/20 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <LineChart className="size-4 text-recovery" />
              <CardTitle className="text-base font-bold">Revenue Recovery Trajectory</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Live cumulative at-risk inflow vs autonomous recovered INR
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-border bg-card text-xs font-semibold">
            Live Ledger Feed
          </Badge>
        </CardHeader>
        <CardContent className="pt-4">
          {chartData.length === 0 ? (
            <div className="py-8">
              <EmptyState
                title="No recovery data yet"
                body="Trigger a test recovery scenario from the top bar to watch the ledger populate in real time."
              />
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="failedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="recoveredFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${Math.round(v / 1000)}k`
                    }
                  />
                  <Tooltip
                    formatter={(value) => [formatInr(Number(value ?? 0)), ""]}
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: 10, fontSize: 12 }}
                    iconType="circle"
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativeFailedInr"
                    name="Failed Inflow (At Risk)"
                    stroke="#94a3b8"
                    fill="url(#failedFill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativeRecoveredInr"
                    name="Recovered Volume"
                    stroke="#059669"
                    fill="url(#recoveredFill)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grid: AI Mix + Recovery Paths */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AgentMixCard mix={agentMix} />
        <JudgeQuickStart />
      </div>

      {/* Merchant Policy Limits */}
      <PolicyLimitsCard />

      {/* Automated Actions Breakdown */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-recovery" />
            <CardTitle className="text-base font-bold">Autonomous Recovery Actions Triggered</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Dynamic distribution of AI diagnosis-driven recovery mechanisms
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {(summary?.actions?.length ?? 0) === 0 ? (
            <div className="py-4">
              <EmptyState
                title="No AI actions yet"
                body="Execute a scenario to view automated payment links, retries, and customer follow-up actions."
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {summary!.actions.map((a) => (
                <div
                  key={a.actionType}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-card p-3 shadow-xs transition-all hover:border-border"
                >
                  <span className="truncate text-xs font-semibold text-foreground uppercase tracking-wider">
                    {a.actionType.replace(/_/g, " ")}
                  </span>
                  <Badge variant="recovery" className="font-mono text-xs font-bold">
                    {a.count}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
