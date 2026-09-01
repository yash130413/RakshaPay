import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "recovery" | "escalate" | "reject";
}) {
  const valueClass =
    tone === "recovery"
      ? "text-recovery"
      : tone === "escalate"
        ? "text-escalate"
        : tone === "reject"
          ? "text-reject"
          : "text-foreground";

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
