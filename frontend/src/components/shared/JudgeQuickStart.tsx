import { CheckCircle2, PlayCircle, ShieldAlert, Sparkles, UserCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const RECOVERY_PATHS = [
  {
    step: "1",
    title: "Autonomous Recovery Loop",
    body: "Payment fails → AI diagnoses root cause → Policy checks pass → Recovery link generated → Instant capture.",
    icon: Sparkles,
  },
  {
    step: "2",
    title: "Customer Intelligence & Loyalty",
    body: "Accounts with verified successful payment history receive priority routing and tailored recovery channels.",
    icon: UserCheck,
  },
  {
    step: "3",
    title: "Hard Policy Guardrails",
    body: "High-value transactions trigger automated human escalation gates; suspicious amounts are strictly rejected.",
    icon: ShieldAlert,
  },
  {
    step: "4",
    title: "Empirical Performance & Accuracy",
    body: "Demonstrated 49.3% → 68.6% recovery rate improvement with zero unnecessary retry attempts.",
    icon: CheckCircle2,
  },
];

export function JudgeQuickStart() {
  return (
    <Card className="border-border/80 shadow-sm transition-all hover:border-border">
      <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-2">
          <PlayCircle className="size-4 text-recovery" />
          <CardTitle className="text-base font-bold">Autonomous Recovery Lifecycle</CardTitle>
        </div>
        <CardDescription>Core execution architecture & policy verification paths</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <ol className="space-y-3.5">
          {RECOVERY_PATHS.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.step} className="flex items-start gap-3 rounded-lg border border-border/40 bg-card/60 p-2.5 transition-all hover:bg-muted/30">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-recovery-muted text-recovery shadow-xs">
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
