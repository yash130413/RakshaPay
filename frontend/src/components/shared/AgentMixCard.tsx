import { Brain, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentMix } from "@/lib/submission";

type AgentMixCardProps = {
  mix: AgentMix;
};

export function AgentMixCard({ mix }: AgentMixCardProps) {
  if (mix.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
        <CardTitle className="text-base">AI Decision Engine</CardTitle>
        <CardDescription>Advanced LLM vs rules fallback on live cases</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Run a demo to see whether Gemini or rules powered each recovery decision.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">AI Decision Engine</CardTitle>
        <CardDescription>
          Live ledger · {mix.total} cases · AI model when API available, rules on fallback
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="bg-gemini transition-all"
            style={{ width: `${mix.geminiPct}%` }}
            title={`AI Model ${mix.geminiPct}%`}
          />
          <div
            className="bg-rules transition-all"
            style={{ width: `${mix.rulesPct}%` }}
            title={`Rules ${mix.rulesPct}%`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MixStat
            icon={Sparkles}
            label="AI Model"
            count={mix.gemini}
            pct={mix.geminiPct}
            tone="gemini"
          />
          <MixStat
            icon={Brain}
            label="Rules fallback"
            count={mix.rules}
            pct={mix.rulesPct}
            tone="rules"
          />
        </div>
        {mix.pending > 0 && (
          <p className="text-xs text-muted-foreground">{mix.pending} case(s) pending AI decisions</p>
        )}
      </CardContent>
    </Card>
  );
}

function MixStat({
  icon: Icon,
  label,
  count,
  pct,
  tone,
}: {
  icon: typeof Sparkles;
  label: string;
  count: number;
  pct: number;
  tone: "gemini" | "rules";
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon className={`size-3.5 ${tone === "gemini" ? "text-gemini" : "text-rules"}`} />
        <span className="text-xs font-semibold text-foreground">{label}</span>
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
        {count}
        <span className="ml-1 text-xs font-normal text-muted-foreground">({pct}%)</span>
      </p>
    </div>
  );
}
