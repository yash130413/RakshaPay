import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Shield,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LoginPageProps = {
  onLogin: (user: { id?: string; email: string; name: string; merchantName: string }) => void;
};

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const DEMO_ACCESS = {
  email: "demo@rakshapay.com",
  password: "demo1234",
  name: "Demo Merchant",
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const performDatabaseAuth = async (loginEmail: string, loginPass: string) => {
    setIsLoading(true);
    setAuthError(null);

    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      onLogin({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        merchantName: data.user.merchantName,
      });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Database connection or credentials error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performDatabaseAuth(email.trim().toLowerCase(), password);
  };

  return (
    <div className="flex min-h-svh w-full flex-col bg-background lg:grid lg:grid-cols-12">
      {/* Left side: Login Form */}
      <div className="flex flex-1 flex-col justify-between p-6 sm:p-10 lg:col-span-7 xl:col-span-6">
        <div>
          {/* Brand header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-recovery via-recovery to-brand shadow-md shadow-recovery/25 ring-1 ring-recovery/20">
                <TrendingUp className="size-[18px] text-white" strokeWidth={2.5} />
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-recovery" />
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight text-foreground">
                  Raksha<span className="text-recovery">Pay</span>
                </p>
                <p className="text-[11px] font-medium text-muted-foreground">
                  AI Revenue Recovery
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Center Card */}
        <div className="mx-auto my-auto w-full max-w-md py-8">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Merchant Login
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to access your autonomous revenue recovery dashboard
            </p>
          </div>

          {authError && (
            <div className="mb-4 rounded-lg border border-reject-muted bg-reject-muted/50 p-2.5 text-xs text-reject-foreground">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setEmail(DEMO_ACCESS.email);
              setPassword(DEMO_ACCESS.password);
              setAuthError(null);
            }}
            className="mb-4 w-full rounded-xl border border-recovery/25 bg-recovery-muted/40 px-3.5 py-3 text-left transition-colors hover:bg-recovery-muted/70"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-recovery">
              Recruiter demo access
            </p>
            <p className="mt-1 text-xs text-foreground">
              <span className="font-medium">{DEMO_ACCESS.email}</span>
              <span className="text-muted-foreground"> · password </span>
              <span className="font-mono font-medium">{DEMO_ACCESS.password}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Click to autofill, then sign in as {DEMO_ACCESS.name}
            </p>
          </button>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Merchant Email / ID
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="merchant@yourbusiness.com"
                  className="pl-9"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  Security Key / Password
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Encrypted & Secure
                </span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="pl-9 pr-9"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-3.5 rounded border-border text-recovery accent-recovery"
                />
                Remember this terminal
              </label>
              <span className="text-[11px] text-muted-foreground">
                Razorpay Webhook v2
              </span>
            </div>

            <Button
              type="submit"
              className="h-10 w-full gap-2 rounded-lg bg-recovery text-sm font-semibold text-white shadow-md shadow-recovery/20 transition-all hover:bg-recovery/90 hover:shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Authenticating...</span>
                </div>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

          {/* Security note */}
          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <Shield className="size-3.5 text-recovery" />
            <span>Policy-gated agent · Razorpay API signature verified</span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground lg:text-left">
          <p>© 2026 RakshaPay · AI revenue recover</p>
        </div>
      </div>

      {/* Right side: Feature / Product Showpiece (Desktop) */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-l border-border bg-slate-950 p-10 text-white lg:col-span-5 lg:flex xl:col-span-6">
        {/* Modern radial gradients with clean ambient glow */}
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 size-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-25" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Autonomous Revenue Recovery
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-50 xl:text-4xl">
            Never lose revenue to <br className="hidden xl:block" />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              preventable payment failures.
            </span>
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-400">
            RakshaPay combines instant failure diagnosis, customizable safety policy gates, and automated recovery actions to maximize your conversion.
          </p>
        </div>

        {/* Organized Live Recovery Workflow Stepper Card */}
        <div className="relative z-10 my-6 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold tracking-wide text-slate-200">
                Live Recovery Workflow
              </span>
            </div>
            <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-400">
              Webhook Verified
            </span>
          </div>

          {/* Stepper Steps */}
          <div className="mt-4 space-y-3">
            {/* Step 1: Failed Inflow */}
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Detected Failure
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                  ₹2,499 · <span className="font-normal text-rose-400">Insufficient Funds</span>
                </p>
              </div>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
                Loyal Customer (8 pays)
              </span>
            </div>

            {/* Timeline connectors */}
            <div className="grid gap-2 pl-1">
              <div className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-950/30 px-3 py-2 text-xs text-slate-300">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-purple-500/10 text-purple-400">
                  <Sparkles className="size-3.5" />
                </div>
                <span>
                  <strong className="font-semibold text-slate-200">AI Diagnosis:</strong> Temporary failure identified
                </span>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-950/30 px-3 py-2 text-xs text-slate-300">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400">
                  <Shield className="size-3.5" />
                </div>
                <span>
                  <strong className="font-semibold text-slate-200">Policy Check:</strong> Passed (Limit: ₹25,000 · Retries: 1/2)
                </span>
              </div>
            </div>

            {/* Step 3: Success Recovery */}
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/60 to-emerald-900/30 p-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-100">
                    Payment Link Executed & Captured
                  </p>
                  <p className="text-[10px] text-emerald-400/80">
                    Money closed directly to merchant ledger
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold tracking-tight text-emerald-400">
                +₹2,499
              </span>
            </div>
          </div>
        </div>

        {/* Bottom stats row */}
        <div className="relative z-10 grid grid-cols-3 gap-3 border-t border-slate-800 pt-6">
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-3 text-center">
            <p className="text-2xl font-extrabold text-slate-100">68.6%</p>
            <p className="mt-0.5 text-xs font-medium text-slate-400">Recovery Rate</p>
          </div>
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-3 text-center">
            <p className="text-2xl font-extrabold text-emerald-400">0</p>
            <p className="mt-0.5 text-xs font-medium text-slate-400">Unnecessary Retries</p>
          </div>
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-3 text-center">
            <p className="text-2xl font-extrabold text-cyan-400">100%</p>
            <p className="mt-0.5 text-xs font-medium text-slate-400">Policy Gated</p>
          </div>
        </div>
      </div>
    </div>
  );
}
