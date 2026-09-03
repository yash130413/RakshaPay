import { Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_POLICY_LIMITS } from "@/lib/submission";
import { formatInr } from "@/lib/format";

export function PolicyLimitsCard() {
  const { maxRetries, maxRecoveryInr, humanReviewAboveInr, paymentLinks } = DEMO_POLICY_LIMITS;

  return (
    <Card className="border-escalate/20 bg-gradient-to-br from-card to-escalate-muted/10">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-escalate" />
          <CardTitle className="text-base">Merchant Policy Guardrails</CardTitle>
        </div>
        <CardDescription>
          Hard deterministic limits — safety & compliance gates protecting transaction flows
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          <PolicyRule label="Human review above" value={formatInr(humanReviewAboveInr)} />
          <PolicyRule label="Max auto-recovery" value={formatInr(maxRecoveryInr)} />
          <PolicyRule label="Max blind retries" value={String(maxRetries)} />
          <PolicyRule label="Payment links" value={paymentLinks ? "Allowed" : "Blocked"} />
        </ul>
      </CardContent>
    </Card>
  );
}

function PolicyRule({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-lg border border-border/80 bg-card/80 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </li>
  );
}
