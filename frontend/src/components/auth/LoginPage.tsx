import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LoginPageProps = {
  onLogin: (user: { id?: string; email: string; name: string; merchantName: string }) => void;
};

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("yashrohilla1204@gmail.com");
  const [password, setPassword] = useState("10122004");
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

  const handleQuickDemoLogin = (role: "merchant" | "judge") => {
    const targetEmail = role === "judge" ? "judge@razorpay-eval.internal" : "yashrohilla1204@gmail.com";
    setEmail(targetEmail);
    setPassword("10122004");
    performDatabaseAuth(targetEmail, "10122004");
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
                  Track 03 · AI Revenue Recovery
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-recovery/30 bg-recovery-muted/50 text-[11px] font-semibold text-recovery-foreground"
            >
              ● Production Ready
            </Badge>
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

          {/* Quick Demo Access Bar for judges/reviewers */}
          <div className="mb-6 rounded-xl border border-border bg-muted/40 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-recovery" />
                <span className="text-xs font-semibold text-foreground">
                  Judge & Reviewer Quick Start
                </span>
              </div>
              <Badge variant="gemini" className="text-[10px] uppercase">
                1-Click
              </Badge>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Instant access with pre-configured webhooks and sample recovery scenarios.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-recovery/30 text-xs font-medium text-recovery-foreground hover:bg-recovery-muted/40"
                onClick={() => handleQuickDemoLogin("merchant")}
                disabled={isLoading}
              >
                <Zap className="mr-1 size-3.5 text-recovery" />
                Yash Rohilla
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-brand/30 text-xs font-medium text-brand hover:bg-brand/10"
                onClick={() => handleQuickDemoLogin("judge")}
                disabled={isLoading}
              >
                <Sparkles className="mr-1 size-3.5 text-brand" />
                Judge Sandbox
              </Button>
            </div>
          </div>

          <div className="relative my-5 flex items-center justify-center">
            <div className="w-full border-t border-border" />
            <span className="absolute bg-background px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Or with credentials
            </span>
          </div>

          {authError && (
            <div className="mb-4 rounded-lg border border-reject-muted bg-reject-muted/50 p-2.5 text-xs text-reject-foreground">
              {authError}
            </div>
          )}

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
                  placeholder="yashrohilla1204@gmail.com"
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
                <a
                  href="#forgot"
                  onClick={(e) => {
                    e.preventDefault();
                    setEmail("yashrohilla1204@gmail.com");
                    setPassword("10122004");
                  }}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Auto-fill demo?
                </a>
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
          <p>© 2026 RakshaPay · Razorpay AI Track 03 Internship Submission</p>
        </div>
      </div>

      {/* Right side: Feature / Product Showpiece (Desktop) */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-l border-border bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950 p-10 text-white lg:col-span-5 lg:flex xl:col-span-6">
        {/* Glow background effects */}
        <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 size-80 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative z-10">
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold text-emerald-400"
          >
            Autonomous Payment Recovery
          </Badge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white xl:text-4xl">
            Never lose revenue to preventable payment failures.
          </h2>
          <p className="mt-3 text-sm text-slate-300">
            RakshaPay uses AI diagnosis, merchant safety policies, and Razorpay
            automated workflows to turn failed checkouts into successful recoveries.
          </p>
        </div>

        {/* Mock visual preview */}
        <div className="relative z-10 my-8 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-slate-200">
                Live Recovery Workflow
              </span>
            </div>
            <span className="text-[11px] font-mono text-emerald-400">
              Verified Webhook
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-black/30 p-3">
              <div>
                <p className="text-xs text-slate-400">Detected Failure</p>
                <p className="text-sm font-semibold text-white">
                  ₹2,499 · Insufficient Funds
                </p>
              </div>
              <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-[10px]">
                Loyal Customer (8 pays)
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Sparkles className="size-3.5 text-purple-400 shrink-0" />
              <span>AI diagnosis categorized as temporary failure</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Shield className="size-3.5 text-emerald-400 shrink-0" />
              <span>Policy check passed (Limit: ₹25,000 / Retries: 1 of 2)</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-medium text-emerald-200">
                  Recovery payment link executed & captured
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-400">+₹2,499</span>
            </div>
          </div>
        </div>

        {/* Bottom stats row */}
        <div className="relative z-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
          <div>
            <p className="text-2xl font-bold text-white">68.6%</p>
            <p className="text-xs text-slate-400">Recovery Rate</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-400">0</p>
            <p className="text-xs text-slate-400">Unnecessary Retries</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">100%</p>
            <p className="text-xs text-slate-400">Policy Gated</p>
          </div>
        </div>
      </div>
    </div>
  );
}
