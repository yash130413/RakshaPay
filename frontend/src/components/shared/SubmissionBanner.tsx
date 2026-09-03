import { ArrowRight, Shield, Sparkles, Webhook, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: Sparkles, label: "AI decides", detail: "Diagnosis + recovery strategy" },
  { icon: Shield, label: "Policy controls", detail: "Amount · retries · human gate" },
  { icon: Zap, label: "Razorpay executes", detail: "Recovery payment links" },
  { icon: Webhook, label: "Webhooks verify", detail: "Capture → RECOVERED" },
];

type SubmissionBannerProps = {
  onOpenResearch?: () => void;
};

export function SubmissionBanner({ onOpenResearch }: SubmissionBannerProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-brand/20 bg-gradient-to-br from-sky-50/80 via-card to-accent/30 shadow-sm">
      <div className="border-b border-border/60 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">RakshaPay</Badge>
          <Badge variant="outline">AI Revenue Recovery</Badge>
        </div>
        <h2 className="mt-2 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          AI revenue recovery agent for merchants
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground text-balance">
          When a payment fails, AI recommends a recovery action. Policy gates every move.
          Razorpay executes. Webhooks verify recovered rupees on this dashboard.
        </p>
      </div>
      <div className="grid gap-px bg-border/60 sm:grid-cols-4">
        {STEPS.map(({ icon: Icon, label, detail }) => (
          <div key={label} className="bg-card/90 px-4 py-3.5 sm:px-3">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-recovery-muted text-recovery">
                <Icon className="size-3.5" />
              </div>
              <span className="text-xs font-semibold text-foreground">{label}</span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
      {onOpenResearch && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5 sm:px-5">
          <p className="text-xs text-muted-foreground">
            Held-out eval: blind retry <strong className="text-foreground">49.3%</strong> → Raksha Pay{" "}
            <strong className="text-recovery">68.6%</strong> recovery
          </p>
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={onOpenResearch}>
            View research
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
