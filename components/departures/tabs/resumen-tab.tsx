import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEUR } from "@/lib/utils";
import type { DepartureSummary } from "@/types/db";

export function ResumenTab({ departureId, summary }: { departureId: string; summary: DepartureSummary | null }) {
  if (!summary) return <p className="text-muted-foreground">Sin datos aún.</p>;
  const expected = summary.expected_revenue_eur || 0;
  const cost = summary.confirmed_or_estimated_cost_eur || 0;
  const profit = expected - cost;
  const profitPct = expected > 0 ? Math.round((profit / expected) * 100) : 0;
  const perPilgrim = summary.pilgrims_count > 0 ? profit / summary.pilgrims_count : 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <KPI label="Peregrinos" value={`${summary.pilgrims_count}${summary.capacity ? ` / ${summary.capacity}` : ""}`} />
      <KPI label="Ingresos esperados" value={formatEUR(summary.expected_revenue_eur)} />
      <KPI label="Cobrado" value={formatEUR(summary.collected_revenue_eur)} />
      <KPI label="Costo estimado" value={formatEUR(summary.estimated_cost_eur)} />
      <KPI label="Costo (estimado/confirmado)" value={formatEUR(summary.confirmed_or_estimated_cost_eur)} />
      <KPI label="Pagado a proveedores" value={formatEUR(summary.paid_to_providers_eur)} />
      <KPI label="Gastos operativos" value={formatEUR(summary.operational_expenses_eur)} />
      <KPI label="Utilidad proyectada" value={formatEUR(profit)} accent hint={`${profitPct}% margen`} />
      <KPI label="Utilidad por peregrino" value={formatEUR(perPilgrim)} hint="Si todos pagan" />
    </div>
  );
}

function KPI({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-camino-yellow border-2" : undefined}>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1 font-display">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
