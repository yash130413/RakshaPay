import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  PlayCircle,
  Radio,
  Shield,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";

export type AuditEventMeta = {
  icon: LucideIcon;
  label: string;
  tone: "default" | "recovery" | "escalate" | "reject" | "brand";
};

const EVENT_META: Record<string, AuditEventMeta> = {
  "payment.failed": { icon: XCircle, label: "Payment failed", tone: "reject" },
  "payment.captured": { icon: CheckCircle2, label: "Payment captured", tone: "recovery" },
  "webhook.received": { icon: Radio, label: "Webhook received", tone: "brand" },
  "webhook.rejected": { icon: AlertTriangle, label: "Webhook rejected", tone: "reject" },
  "demo.triggered": { icon: PlayCircle, label: "Demo triggered", tone: "brand" },
  "risk.detected": { icon: AlertTriangle, label: "Risk detected", tone: "escalate" },
  "diagnosis.completed": { icon: Sparkles, label: "AI diagnosis", tone: "brand" },
  "recovery.recommended": { icon: Sparkles, label: "Action recommended", tone: "brand" },
  "policy.approved": { icon: Shield, label: "Policy approved", tone: "recovery" },
  "policy.escalated": { icon: Shield, label: "Policy escalated", tone: "escalate" },
  "policy.rejected": { icon: Shield, label: "Policy rejected", tone: "reject" },
  "recovery.executed": { icon: Zap, label: "Razorpay executed", tone: "recovery" },
  "recovery.execution_failed": { icon: XCircle, label: "Execution failed", tone: "reject" },
  "recovery.failed": { icon: XCircle, label: "Recovery failed", tone: "reject" },
  "recovery.confirmed": { icon: CheckCircle2, label: "Recovery verified", tone: "recovery" },
  "recovery.verification_failed": {
    icon: AlertTriangle,
    label: "Verification failed",
    tone: "reject",
  },
};

export function getAuditEventMeta(eventType: string): AuditEventMeta {
  return (
    EVENT_META[eventType] ?? {
      icon: Radio,
      label: eventType.replace(/\./g, " · "),
      tone: "default",
    }
  );
}

export const TONE_CLASSES = {
  default: "bg-muted text-muted-foreground",
  recovery: "bg-recovery-muted text-recovery-foreground",
  escalate: "bg-escalate-muted text-escalate-foreground",
  reject: "bg-reject-muted text-reject-foreground",
  brand: "bg-gemini-muted text-gemini-foreground",
} as const;
