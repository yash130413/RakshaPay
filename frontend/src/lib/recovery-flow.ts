import type { RecoveryCase } from "@/lib/types";

export type FlowStepId = "failed" | "diagnosed" | "policy" | "executed" | "verified";

export type FlowStepState = "pending" | "active" | "done" | "blocked";

export type FlowStep = {
  id: FlowStepId;
  label: string;
  state: FlowStepState;
  detail?: string;
};

const POLICY_EVENTS = new Set(["policy.approved", "policy.escalated", "policy.rejected"]);
const EXEC_EVENTS = new Set(["recovery.executed", "recovery.recommended"]);
const VERIFY_EVENTS = new Set(["recovery.confirmed", "payment.captured"]);

function hasEvent(audits: { eventType: string }[] | undefined, events: string[]) {
  if (!audits?.length) return false;
  const set = new Set(events);
  return audits.some((a) => set.has(a.eventType));
}

export function buildRecoveryFlowSteps(recoveryCase: RecoveryCase): FlowStep[] {
  const audits = recoveryCase.audits ?? [];
  const status = recoveryCase.status;
  const policyBlocked = status === "ESCALATED" || status === "REJECTED";

  const policyEvent = audits.find((a) => POLICY_EVENTS.has(a.eventType));
  const policyDetail =
    status === "ESCALATED"
      ? "Human review"
      : status === "REJECTED"
        ? "Blocked"
        : policyEvent
          ? policyEvent.eventType.replace("policy.", "")
          : undefined;

  const doneFlags = {
    failed:
      hasEvent(audits, ["payment.failed", "webhook.received", "demo.triggered"]) ||
      status !== "RECEIVED",
    diagnosed:
      hasEvent(audits, ["diagnosis.completed", "risk.detected"]) ||
      Boolean(recoveryCase.diagnosis),
    policy:
      hasEvent(audits, [...POLICY_EVENTS]) ||
      ["ESCALATED", "REJECTED", "RECOVERED", "WAITING_FOR_WEBHOOK", "EXECUTING", "APPROVED"].includes(
        status
      ),
    executed:
      hasEvent(audits, [...EXEC_EVENTS]) ||
      ["WAITING_FOR_WEBHOOK", "RECOVERED", "EXECUTING"].includes(status),
    verified: hasEvent(audits, [...VERIFY_EVENTS]) || status === "RECOVERED",
  };

  const steps: FlowStep[] = [
    {
      id: "failed",
      label: "Failed",
      state: "pending",
      detail: recoveryCase.failureReason ?? undefined,
    },
    {
      id: "diagnosed",
      label: "Diagnosed",
      state: "pending",
      detail: recoveryCase.diagnosis ?? undefined,
    },
    {
      id: "policy",
      label: "Policy",
      state: "pending",
      detail: policyDetail,
    },
    {
      id: "executed",
      label: "Executed",
      state: "pending",
      detail: recoveryCase.recommendedAction?.replace(/_/g, " ").toLowerCase(),
    },
    { id: "verified", label: "Recovered", state: "pending" },
  ];

  const keys: FlowStepId[] = ["failed", "diagnosed", "policy", "executed", "verified"];

  keys.forEach((key, i) => {
    const step = steps[i];
    if (key === "policy" && policyBlocked) {
      step.state = "blocked";
      return;
    }
    if (doneFlags[key]) {
      step.state = "done";
    }
  });

  if (!policyBlocked) {
    const firstIncomplete = steps.findIndex((s) => s.state === "pending");
    if (firstIncomplete >= 0) {
      steps[firstIncomplete].state = "active";
    }
  }

  return steps;
}
