import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatTime } from "@/lib/format";
import type { AuditLog } from "@/lib/types";

type AuditViewProps = {
  audits: AuditLog[];
  selectedCaseId: string | null;
};

export function AuditView({ audits, selectedCaseId }: AuditViewProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription className="mt-1">
            Immutable log — detect → diagnose → policy → execute → verify.
          </CardDescription>
        </div>
        <Badge variant="muted">{audits.length} events</Badge>
      </CardHeader>
      <CardContent>
        {audits.length === 0 ? (
          <EmptyState
            title="Audit trail is empty"
            body="Every webhook and policy decision will appear here once the first case runs."
          />
        ) : (
          <ol className="max-h-[calc(100vh-16rem)] space-y-1 overflow-auto">
            {audits.slice(0, 100).map((a) => (
              <li
                key={a.id}
                className={`grid gap-1 rounded-md px-2 py-2 text-sm sm:grid-cols-[5.5rem_11rem_1fr] ${
                  a.recoveryCaseId && a.recoveryCaseId === selectedCaseId ? "bg-accent" : undefined
                }`}
              >
                <span className="tabular-nums text-muted-foreground">
                  {formatTime(a.createdAt)}
                </span>
                <span className="font-mono text-xs text-recovery">{a.eventType}</span>
                <span className="text-foreground">{a.message}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
