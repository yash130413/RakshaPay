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
import { SubmissionBanner } from "@/components/shared/SubmissionBanner";
import { formatInr } from "@/lib/format";
import { computeAgentMix } from "@/lib/submission";
import type { RecoveryCase, SeriesPoint, Summary } from "@/lib/types";
import { LineChart } from "lucide-react";

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
    <div className="space-y-5">
      {/* 1. RakshaPay platform banner */}
      <SubmissionBanner onOpenResearch={onOpenResearch} />

      {/* 2. Real-time revenue performance */}
      <HeroMetrics summary={summary} />

      {/* 3. Revenue recovery trajectory */}
      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-muted/20 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-recovery-muted text-recovery">
                <LineChart className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">Revenue Recovery Trajectory</CardTitle>
                <CardDescription className="text-xs">
                  Cumulative at-risk inflow vs recovered INR
                </CardDescription>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="border-border bg-card text-xs font-semibold">
            Live ledger
          </Badge>
        </CardHeader>
        <CardContent className="pt-4">
          {chartData.length === 0 ? (
            <div className="py-10">
              <EmptyState
                title="No recovery data yet"
                body="Run a demo from the top bar — the chart fills as cases arrive."
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
                  <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} iconType="circle" />
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

      {/* 4 + 5. AI Decision Engine + Autonomous Recovery Lifecycle */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AgentMixCard mix={agentMix} />
        <JudgeQuickStart />
      </div>
    </div>
  );
}
