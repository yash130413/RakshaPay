import { PlayCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const JUDGE_STEPS = [
  {
    step: "1",
    title: "Full recovery loop",
    body: "Run demo → Full recovery → open case drawer → show Failed → Diagnosed → Policy → Executed → Recovered",
  },
  {
    step: "2",
    title: "Policy cannot be bypassed",
    body: "Escalate ₹30,000 (human threshold) and Reject ₹60,000 (max amount) — model stops at policy gate",
  },
  {
    step: "3",
    title: "Measured, not vibes",
    body: "Research tab: holdout n=885 — recovery 49.3% → 68.6%, unnecessary retries 1009 → 0",
  },
];

export function JudgeQuickStart() {
  return (
    <Card className="border-recovery/20">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <PlayCircle className="size-4 text-recovery" />
          <CardTitle className="text-base">5-minute demo path</CardTitle>
        </div>
        <CardDescription>For judges — matches docs/demo-script.md</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {JUDGE_STEPS.map((s) => (
            <li key={s.step} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-recovery-muted text-[11px] font-bold text-recovery-foreground">
                {s.step}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
