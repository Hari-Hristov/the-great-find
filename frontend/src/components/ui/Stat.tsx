import { Card, CardContent } from "@/components/ui/card";

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </div>
        <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
