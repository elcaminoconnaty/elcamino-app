import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EurCop } from "@/components/ui/eur-cop";
import { CostDonut } from "@/components/departures/cost-donut";
import { ScenariosCard } from "@/components/departures/scenarios-card";
import { BreakEvenCard } from "@/components/departures/break-even-card";
import { CostBreakdownCard } from "@/components/departures/cost-breakdown-card";
import { PerPilgrimCostCard } from "@/components/departures/per-pilgrim-cost-card";
import type { DepartureFinance } from "@/lib/finance";

export async function ResumenTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: finance }, { data: items }] = await Promise.all([
    supabase.from("v_departure_finance").select("*").eq("departure_id", departureId).maybeSingle(),
    supabase.from("budget_items").select("category, scaling, estimated_unit_cost_eur, confirmed_unit_cost_eur, quantity").eq("departure_id", departureId).neq("status", "cancelado"),
  ]);

  if (!finance) return <p className="text-muted-foreground">Sin datos aún.</p>;
  const f = finance as DepartureFinance;

  const inscritos = f.inscritos_total;
  const pagantes = f.pagantes_count;
  const byCategory = new Map<string, number>();
  (items ?? []).forEach((b: any) => {
    const unitCost = Number(b.confirmed_unit_cost_eur ?? b.estimated_unit_cost_eur ?? 0);
    let total = 0;
    if (b.scaling === "fijo_grupo") total = unitCost * Number(b.quantity);
    else if (b.scaling === "por_inscrito") total = unitCost * inscritos;
    else if (b.scaling === "por_pagante") total = unitCost * pagantes;
    else if (b.scaling === "viatico_team") total = unitCost * Number(b.quantity);
    byCategory.set(b.category, (byCategory.get(b.category) ?? 0) + total);
  });
  const donutData = Array.from(byCategory.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <KPI label="Pagantes inscritos" value={`${f.pagantes_count}${f.capacity ? ` / ${f.capacity}` : ""}`} hint={`+ ${f.team_count} equipo`} accent />
        <KPI label="Ingresos esperados" value={<EurCop value={f.expected_revenue_eur} />} hint={<>Cobrado <EurCop value={f.collected_revenue_eur} /></>} />
        <KPI label="Costo total proyectado" value={<EurCop value={f.costo_total_eur} />} hint={<><EurCop value={f.costo_por_pagante_unitario_eur} /> por pagante</>} />
        <KPI
          label="Utilidad proyectada"
          value={<EurCop value={f.utilidad_total_eur} />}
          hint={<><EurCop value={f.utilidad_por_pagante_eur} /> por pagante</>}
          negative={Number(f.utilidad_total_eur) < 0}
          positive={Number(f.utilidad_total_eur) >= 0}
        />
        <KPI label="Precio promedio" value={<EurCop value={f.precio_promedio_pagante_eur} />} hint="Por pagante (excluye equipo)" />
        <KPI label="Pendiente por cobrar" value={<EurCop value={f.pending_revenue_eur} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Desglose por categoría</CardTitle></CardHeader>
          <CardContent>
            <CostDonut data={donutData} />
          </CardContent>
        </Card>
        <CostBreakdownCard finance={f} />
        <div className="space-y-4">
          <BreakEvenCard finance={f} />
          <ScenariosCard finance={f} />
        </div>
      </div>

      <PerPilgrimCostCard departureId={departureId} />
    </div>
  );
}

function KPI({ label, value, hint, accent, positive, negative }: { label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: boolean; positive?: boolean; negative?: boolean }) {
  const cls = negative ? "border-red-200 border-2" : positive ? "border-green-200 border-2" : accent ? "border-camino-yellow border-2" : "";
  const textCls = negative ? "text-red-700" : positive ? "text-green-700" : "";
  return (
    <Card className={cls}>
      <CardContent className="pt-5 pb-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-2xl font-display font-semibold mt-1 ${textCls}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
