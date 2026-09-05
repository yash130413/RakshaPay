const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  ANALYZING: "Analyzing",
  DIAGNOSED: "Diagnosed",
  ACTION_SELECTED: "Action selected",
  POLICY_CHECK: "Policy check",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXECUTING: "Executing",
  WAITING_FOR_WEBHOOK: "Awaiting payment",
  RECOVERED: "Recovered",
  FAILED: "Failed",
  ESCALATED: "Escalated",
};

const statusVariantMap: Record<
  string,
  "recovery" | "escalate" | "reject" | "default" | "muted"
> = {
  RECOVERED: "recovery",
  WAITING_FOR_WEBHOOK: "default",
  EXECUTING: "default",
  APPROVED: "default",
  ESCALATED: "escalate",
  FAILED: "reject",
  REJECTED: "reject",
};

export function formatStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ").toLowerCase();
}

export function statusBadgeVariant(status: string) {
  return statusVariantMap[status] ?? "muted";
}

export function formatCaseSummary(caseItem: {
  diagnosis: string | null;
  recommendedAction: string | null;
  failureReason: string | null;
}) {
  const diagnosis = caseItem.diagnosis ?? "Pending diagnosis";
  const action = caseItem.recommendedAction?.replace(/_/g, " ").toLowerCase() ?? "no action";
  const reason = caseItem.failureReason ? ` · ${caseItem.failureReason}` : "";
  return `${diagnosis} → ${action}${reason}`;
}

export function formatFilterLabel(filter: string) {
  if (filter === "ALL") return "All";
  if (filter === "WAITING_FOR_WEBHOOK") return "Awaiting";
  if (filter === "ASSIGNED") return "My assigned";
  return formatStatusLabel(filter);
}
