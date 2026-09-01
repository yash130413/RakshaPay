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
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">Audit trail</CardTitle>
          <CardDescription>
            Immutable log — detect → diagnose → policy → execute → verify
          </CardDescription>
        </div>
        <Badge variant="muted">{audits.length} events</Badge>
      </CardHeader>
      <CardContent className="p-0 sm:px-6 sm:pb-6">
        {audits.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState
              title="Audit trail is empty"
              body="Every webhook and policy decision will appear here once the first case runs."
            />
          </div>
        ) : (
          <ol className="max-h-[calc(100vh-14rem)] divide-y divide-border overflow-auto">
            {audits.slice(0, 100).map((a) => (
              <li
                key={a.id}
                className={`grid gap-1 px-4 py-3 text-sm sm:grid-cols-[5rem_10rem_1fr] sm:px-2 ${
                  a.recoveryCaseId && a.recoveryCaseId === selectedCaseId ? "bg-accent/70" : undefined
                }`}
              >
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatTime(a.createdAt)}
                </span>
                <span className="truncate font-mono text-[10px] font-medium uppercase text-recovery">
                  {a.eventType}
                </span>
                <span className="text-sm text-foreground">{a.message}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
