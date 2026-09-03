import { useState, useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  Download,
  Layers,
  Radio,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AuditTimeline } from "@/components/shared/AuditTimeline";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatTime } from "@/lib/format";
import type { AuditLog } from "@/lib/types";
import { cn } from "@/lib/utils";

type AuditViewProps = {
  audits: AuditLog[];
  selectedCaseId: string | null;
};

type FilterCategory = "all" | "ai" | "policy" | "execution" | "payment";

export function AuditView({ audits, selectedCaseId }: AuditViewProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<FilterCategory>("all");
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  // Stats calculation
  const stats = useMemo(() => {
    let aiCount = 0;
    let policyApproved = 0;
    let policyBlocked = 0;
    let recoveries = 0;

    audits.forEach((a) => {
      if (a.eventType.includes("diagnosis") || a.eventType.includes("recovery.recommended")) aiCount++;
      if (a.eventType === "policy.approved") policyApproved++;
      if (a.eventType === "policy.escalated" || a.eventType === "policy.rejected") policyBlocked++;
      if (a.eventType === "recovery.confirmed" || a.eventType === "payment.captured") recoveries++;
    });

    return {
      total: audits.length,
      aiCount,
      policyApproved,
      policyBlocked,
      recoveries,
    };
  }, [audits]);

  // Filter audits based on search & category
  const filteredAudits = useMemo(() => {
    return audits.filter((a) => {
      // Category filter
      if (category === "ai") {
        if (!a.eventType.includes("diagnosis") && !a.eventType.includes("recommended") && !a.eventType.includes("risk")) {
          return false;
        }
      } else if (category === "policy") {
        if (!a.eventType.includes("policy")) return false;
      } else if (category === "execution") {
        if (!a.eventType.includes("recovery.executed") && !a.eventType.includes("webhook")) return false;
      } else if (category === "payment") {
        if (!a.eventType.includes("payment")) return false;
      }

      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const msg = a.message.toLowerCase();
        const type = a.eventType.toLowerCase();
        const caseId = (a.recoveryCaseId ?? "").toLowerCase();
        return msg.includes(query) || type.includes(query) || caseId.includes(query);
      }

      return true;
    });
  }, [audits, category, search]);

  const activeAudit = useMemo(() => {
    if (!selectedAuditId) return null;
    return audits.find((a) => a.id === selectedAuditId) ?? null;
  }, [audits, selectedAuditId]);

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredAudits, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `audit-trail-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-sm transition-all hover:border-border">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Total Logged
            </span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-muted text-foreground">
              <Activity className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{stats.total}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Immutable audit entries</p>
        </div>

        <div className="rounded-xl border border-recovery/25 bg-gradient-to-br from-recovery-muted/40 via-card to-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-recovery">
            <span className="text-xs font-semibold uppercase tracking-wider text-recovery-foreground">
              AI Decisions
            </span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-recovery-muted text-recovery">
              <Sparkles className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{stats.aiCount}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Diagnoses & strategies</p>
        </div>

        <div className="rounded-xl border border-brand/20 bg-gradient-to-br from-brand/5 via-card to-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-brand">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand">
              Policy Passed
            </span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <ShieldCheck className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{stats.policyApproved}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{stats.policyBlocked} gated / held</p>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-card to-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
              Recoveries
            </span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
              <CheckCircle2 className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{stats.recoveries}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Verified captures</p>
        </div>
      </div>

      {/* Main Audit Feed & Control Card */}
      <Card className="border-border/80 shadow-sm">
        <div className="border-b border-border/80 bg-muted/20 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
                  Audit Trail & Compliance Log
                </h2>
                <Badge variant="outline" className="border-border bg-card text-[11px] font-semibold">
                  {filteredAudits.length} events
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Cryptographically verifiable, real-time transaction lifecycle telemetry
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJson}
                disabled={filteredAudits.length === 0}
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="size-3.5" />
                Export JSON
              </Button>
            </div>
          </div>

          {/* Search and Filters Bar */}
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by event type, case ID, reason or message..."
                className="h-9 bg-card pl-9 text-xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {(
                [
                  { id: "all", label: "All Logs", icon: Layers },
                  { id: "ai", label: "AI Decisions", icon: Sparkles },
                  { id: "policy", label: "Policy Gates", icon: Shield },
                  { id: "execution", label: "Execution", icon: Zap },
                  { id: "payment", label: "Payments", icon: Radio },
                ] as const
              ).map((cat) => {
                const Icon = cat.icon;
                const isActive = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                      isActive
                        ? "border-recovery bg-recovery/10 font-semibold text-recovery shadow-sm"
                        : "border-border/80 bg-card text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-3" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <CardContent className="p-0 sm:p-0">
          {filteredAudits.length === 0 ? (
            <div className="py-12">
              <EmptyState
                title={search || category !== "all" ? "No matching audit events" : "Audit trail is empty"}
                body={
                  search || category !== "all"
                    ? "Try adjusting your search query or filter category."
                    : "Every webhook, diagnosis, and policy execution will be logged here in real-time."
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* Left timeline container */}
              <div
                className={cn(
                  "p-4 sm:p-6",
                  activeAudit ? "lg:col-span-7 lg:border-r lg:border-border/80" : "lg:col-span-12"
                )}
              >
                <AuditTimeline
                  audits={filteredAudits}
                  selectedCaseId={selectedCaseId}
                  selectedAuditId={selectedAuditId}
                  onSelectAudit={(audit) => setSelectedAuditId(audit.id === selectedAuditId ? null : audit.id)}
                  maxHeight="max-h-[calc(100vh-21rem)]"
                />
              </div>

              {/* Right inspector drawer (when an event is clicked) */}
              {activeAudit && (
                <div className="hidden bg-muted/10 p-5 lg:col-span-5 lg:block">
                  <div className="sticky top-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-border/60 pb-3">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Event Inspector
                        </span>
                        <h3 className="text-sm font-bold text-foreground">{activeAudit.eventType}</h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedAuditId(null)}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Close
                      </Button>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="rounded-lg border border-border/60 bg-card p-3 space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Message</p>
                        <p className="font-medium text-foreground">{activeAudit.message}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-border/60 bg-card p-2.5">
                          <p className="text-[10px] uppercase text-muted-foreground">Timestamp</p>
                          <p className="mt-0.5 font-mono text-xs font-semibold">{formatTime(activeAudit.createdAt)}</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-card p-2.5">
                          <p className="text-[10px] uppercase text-muted-foreground">Case ID</p>
                          <p className="mt-0.5 truncate font-mono text-xs font-semibold text-recovery">
                            {activeAudit.recoveryCaseId ?? "System-level"}
                          </p>
                        </div>
                      </div>

                      {activeAudit.metadata && Object.keys(activeAudit.metadata).length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium text-muted-foreground">Metadata Payload</p>
                          <pre className="max-h-60 overflow-auto rounded-lg border border-border/80 bg-muted/60 p-3 font-mono text-[11px] text-foreground">
                            {JSON.stringify(activeAudit.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
