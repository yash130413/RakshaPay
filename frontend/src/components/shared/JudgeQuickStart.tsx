import { CheckCircle2, PlayCircle, ShieldAlert, Sparkles, UserCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const RECOVERY_PATHS = [
  {
    step: "1",
    title: "Autonomous Recovery Loop",
    body: "Payment fails → AI diagnoses → Policy checks → Recovery link → Capture verified.",
    icon: Sparkles,
  },
  {
    step: "2",
    title: "Customer Intelligence",
    body: "Loyal payment history gets priority routing and tailored recovery channels.",
    icon: UserCheck,
  },
  {
    step: "3",
    title: "Hard Policy Guardrails",
    body: "High-value amounts escalate to humans; over-limit amounts are rejected.",
    icon: ShieldAlert,
  },
  {
    step: "4",
    title: "Measured Performance",
    body: "Holdout eval: 49.3% → 68.6% recovery, with zero unnecessary retries.",
    icon: CheckCircle2,
  },
];

export function JudgeQuickStart() {
  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/40 bg-muted/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-recovery-muted text-recovery">
            <PlayCircle className="size-4" />
          </div>
          <div>
            <CardTitle className="text-base font-bold">Autonomous Recovery Lifecycle</CardTitle>
            <CardDescription className="text-xs">
              Core execution path from fail to recover
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <ol className="space-y-2.5">
          {RECOVERY_PATHS.map((s) => {
            const Icon = s.icon;
            return (
              <li
                key={s.step}
                className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/70 p-2.5 transition-colors hover:bg-muted/30"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-recovery-muted text-recovery">
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground">{s.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
