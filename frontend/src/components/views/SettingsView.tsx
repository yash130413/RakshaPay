import { useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Link2,
  Save,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  Webhook,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type PolicySettings = {
  maxRetries: number;
  maxRecoveryAmount: number;
  requireHumanAbove: number;
  allowPaymentLink: boolean;
  notifyCustomerSms: boolean;
  notifyCustomerEmail: boolean;
};

const DEFAULTS: PolicySettings = {
  maxRetries: 2,
  maxRecoveryAmount: 50000,
  requireHumanAbove: 25000,
  allowPaymentLink: true,
  notifyCustomerSms: true,
  notifyCustomerEmail: true,
};

type SettingsViewProps = {
  user?: { name: string; email: string; merchantName?: string } | null;
};

function SectionHeader({
  icon: Icon,
  title,
  description,
  accent = "default",
}: {
  icon: typeof Shield;
  title: string;
  description: string;
  accent?: "default" | "recovery" | "escalate" | "brand";
}) {
  const iconClass =
    accent === "recovery"
      ? "text-recovery bg-recovery-muted"
      : accent === "escalate"
        ? "text-escalate bg-escalate-muted"
        : accent === "brand"
          ? "text-brand bg-brand/10"
          : "text-muted-foreground bg-muted";

  return (
    <div className="flex items-start gap-3">
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", iconClass)}>
        <Icon className="size-4" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function RangeRow({
  label,
  sublabel,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  sublabel: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-card/60 p-3.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">{sublabel}</p>
        </div>
        <span className="rounded-lg border border-border bg-muted px-2.5 py-1 font-mono text-xs font-bold text-foreground">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-[var(--color-recovery)]"
        style={{
          background: `linear-gradient(to right, #059669 ${pct}%, #e2e8f0 ${pct}%)`,
          borderRadius: "9999px",
        }}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  sublabel,
  checked,
  onChange,
  tone = "recovery",
}: {
  label: string;
  sublabel: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  tone?: "recovery" | "default";
}) {
  return (
    <div
      className="flex cursor-pointer items-center justify-between rounded-xl border border-border/60 bg-card/60 p-3.5 transition-all hover:bg-muted/30"
      onClick={() => onChange(!checked)}
    >
      <div>
        <p className="text-xs font-bold text-foreground">{label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{sublabel}</p>
      </div>
      <div
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          checked
            ? tone === "recovery"
              ? "bg-recovery"
              : "bg-brand"
            : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow-md transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </div>
    </div>
  );
}

export function SettingsView({ user }: SettingsViewProps) {
  const [policy, setPolicy] = useState<PolicySettings>({ ...DEFAULTS });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const patch = <K extends keyof PolicySettings>(key: K, val: PolicySettings[K]) => {
    setSaved(false);
    setPolicy((p) => ({ ...p, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Policy save endpoint (backend can extend later)
      await new Promise((r) => setTimeout(r, 600)); // simulate save
      setSaved(true);
    } catch {
      setSaveError("Failed to save. Check backend connection.");
    } finally {
      setSaving(false);
    }
  };

  const formatInr = (v: number) =>
    "₹" +
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v);

  // Live preview of policy decisions
  const testAmounts = [9999, 24999, 26000, 52000];

  function preview(amount: number): { label: string; color: string } {
    if (amount > policy.maxRecoveryAmount)
      return { label: "REJECTED", color: "text-reject" };
    if (amount > policy.requireHumanAbove)
      return { label: "ESCALATE → Human", color: "text-escalate" };
    return { label: "AUTO RECOVER", color: "text-recovery" };
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="size-5 text-muted-foreground" />
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              Platform Settings
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Configure merchant policies, recovery automation, and notification preferences
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-recovery">
              <CheckCircle2 className="size-3.5" />
              Saved
            </span>
          )}
          {saveError && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-reject">
              <AlertCircle className="size-3.5" />
              {saveError}
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-9 gap-2 bg-recovery text-white shadow-sm hover:bg-recovery/90"
            size="sm"
          >
            <Save className="size-3.5" />
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: Merchant Info */}
        <div className="space-y-4 lg:col-span-1">
          {/* Merchant Profile */}
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/40 bg-muted/20 pb-3">
              <SectionHeader
                icon={User}
                title="Merchant Account"
                description="Your account identity on RakshaPay"
              />
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="rounded-xl border border-border/60 bg-card/60 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Name
                </p>
                <p className="mt-1 font-semibold text-foreground">{user?.name ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/60 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Email
                </p>
                <p className="mt-1 truncate font-mono text-sm text-foreground">{user?.email ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/60 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Merchant ID
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{user?.merchantName ?? "—"}</p>
              </div>
            </CardContent>
          </Card>

          {/* Webhook Info */}
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/40 bg-muted/20 pb-3">
              <SectionHeader
                icon={Webhook}
                title="Webhook Endpoint"
                description="Configure this URL in your Razorpay Dashboard"
                accent="brand"
              />
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="rounded-xl border border-brand/20 bg-brand/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                  Live Endpoint
                </p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">
                  {API}/webhooks/razorpay
                </p>
              </div>
              <div className="space-y-1.5 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-recovery" />
                  Subscribe: <code className="rounded bg-muted px-1">payment.failed</code>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-recovery" />
                  Subscribe: <code className="rounded bg-muted px-1">payment.captured</code>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-brand" />
                  HMAC-SHA256 signature verified
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Policy Preview */}
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/40 bg-muted/20 pb-3">
              <SectionHeader
                icon={Zap}
                title="Live Policy Preview"
                description="How current policy handles different amounts"
                accent="recovery"
              />
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {testAmounts.map((amt) => {
                  const { label, color } = preview(amt);
                  return (
                    <div
                      key={amt}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-card/60 px-3 py-2"
                    >
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {formatInr(amt)}
                      </span>
                      <ChevronRight className="size-3 text-muted-foreground/50" />
                      <span className={cn("text-xs font-bold", color)}>{label}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Updates live as you adjust limits →
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: Policy + Notifications */}
        <div className="space-y-5 lg:col-span-2">
          {/* Recovery Policy Section */}
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/40 bg-muted/20 pb-3">
              <div className="flex items-start justify-between">
                <SectionHeader
                  icon={Shield}
                  title="Recovery Policy Guardrails"
                  description="Hard limits that the AI engine cannot override — deterministic TypeScript rules"
                  accent="escalate"
                />
                <Badge variant="outline" className="border-border bg-card text-[10px] font-semibold">
                  Deterministic · Not AI
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <RangeRow
                  label="Human Escalation Threshold"
                  sublabel="Auto-recovery stops above this amount — a human is required"
                  value={policy.requireHumanAbove}
                  onChange={(v) => patch("requireHumanAbove", v)}
                  min={5000}
                  max={100000}
                  step={5000}
                  format={formatInr}
                />
                <RangeRow
                  label="Hard Rejection Limit"
                  sublabel="Payments above this are always rejected — no action taken"
                  value={policy.maxRecoveryAmount}
                  onChange={(v) => patch("maxRecoveryAmount", v)}
                  min={10000}
                  max={200000}
                  step={5000}
                  format={formatInr}
                />
                <RangeRow
                  label="Max Blind Retries"
                  sublabel="Maximum auto-retries before escalation kicks in"
                  value={policy.maxRetries}
                  onChange={(v) => patch("maxRetries", v)}
                  min={0}
                  max={5}
                  step={1}
                  format={(v) => `${v} retries`}
                />
              </div>

              {/* Validation warning */}
              {policy.requireHumanAbove >= policy.maxRecoveryAmount && (
                <div className="flex items-center gap-2 rounded-lg border border-escalate/30 bg-escalate-muted/40 px-3 py-2 text-xs text-escalate-foreground">
                  <AlertCircle className="size-3.5 text-escalate" />
                  Escalation threshold should be lower than rejection limit. Adjust accordingly.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recovery Actions */}
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/40 bg-muted/20 pb-3">
              <SectionHeader
                icon={Link2}
                title="Automated Recovery Actions"
                description="Which recovery mechanisms the AI agent is permitted to use"
                accent="recovery"
              />
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <ToggleRow
                label="Payment Links via Razorpay"
                sublabel="Generate smart payment recovery links and send them to the customer"
                checked={policy.allowPaymentLink}
                onChange={(v) => patch("allowPaymentLink", v)}
              />
              <div className="rounded-xl border border-border/40 bg-muted/10 p-3 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Coming soon: </span>
                Auto-retry, UPI Collect, Method Upgrade, Customer Wallet, and Buy Now Pay Later routing.
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/40 bg-muted/20 pb-3">
              <SectionHeader
                icon={Bell}
                title="Customer Notifications"
                description="Razorpay directly delivers recovery notifications when a payment link is created"
                accent="brand"
              />
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <ToggleRow
                label="SMS Notification"
                sublabel="Razorpay sends a recovery SMS to the customer's registered mobile number"
                checked={policy.notifyCustomerSms}
                onChange={(v) => patch("notifyCustomerSms", v)}
                tone="recovery"
              />
              <ToggleRow
                label="Email Notification"
                sublabel="Razorpay emails the customer with a Pay Now button linked to the recovery URL"
                checked={policy.notifyCustomerEmail}
                onChange={(v) => patch("notifyCustomerEmail", v)}
                tone="recovery"
              />
              <div className="flex items-start gap-2 rounded-xl border border-brand/20 bg-brand/5 p-3 text-[11px]">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-brand" />
                <p className="text-muted-foreground">
                  WhatsApp delivery is controlled from your{" "}
                  <strong className="text-foreground">Razorpay Dashboard → Settings → Notifications</strong>.
                  Enable it there to activate WhatsApp recovery messages.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
