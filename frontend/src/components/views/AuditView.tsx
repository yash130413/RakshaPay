import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditTimeline } from "@/components/shared/AuditTimeline";
import { EmptyState } from "@/components/shared/EmptyState";
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
      <CardContent className="sm:px-6 sm:pb-6">
        {audits.length === 0 ? (
          <EmptyState
            title="Audit trail is empty"
            body="Every webhook and policy decision will appear here once the first case runs."
          />
        ) : (
          <AuditTimeline
            audits={audits.slice(0, 100)}
            selectedCaseId={selectedCaseId}
          />
        )}
      </CardContent>
    </Card>
  );
}
