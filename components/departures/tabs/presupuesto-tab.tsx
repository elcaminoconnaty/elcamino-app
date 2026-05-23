import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatEUR } from "@/lib/utils";
import { SCALING_LABELS } from "@/lib/finance";
import { BudgetByCategory } from "@/components/departures/budget-by-category";

export async function PresupuestoTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: items }, { data: providers }, { data: finance }] = await Promise.all([
    supabase
      .from("budget_items")
      .select("*, providers(name)")
      .eq("departure_id", departureId)
      .neq("scaling", "viatico_team")
      .order("item_date", { ascending: true, nullsFirst: false })
      .order("category"),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
    supabase.from("v_departure_finance").select("pagantes_count, team_count").eq("departure_id", departureId).maybeSingle(),
  ]);

  const pagantes = Number((finance as any)?.pagantes_count ?? 0);
  const team = Number((finance as any)?.team_count ?? 0);
  const inscritos = pagantes + team;

  function effectiveTotal(b: any): number {
    const unitCost = Number(b.confirmed_unit_cost_eur ?? b.estimated_unit_cost_eur ?? 0);
    if (b.scaling === "fijo_grupo") return unitCost * Number(b.quantity);
    if (b.scaling === "por_inscrito") return unitCost * inscritos;
    if (b.scaling === "por_pagante") return unitCost * pagantes;
    return unitCost * Number(b.quantity);
  }

  const subtotals: Record<string, number> = { fijo_grupo: 0, por_inscrito: 0, por_pagante: 0 };
  (items ?? []).forEach((b: any) => {
    subtotals[b.scaling] = (subtotals[b.scaling] ?? 0) + effectiveTotal(b);
  });
  const totalAll = Object.values(subtotals).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {(["fijo_grupo", "por_inscrito", "por_pagante"] as const).map((s) => (
          <Card key={s} className="flex-1 min-w-[140px]">
            <CardContent className="p-3">
              <div className={`inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${SCALING_LABELS[s].color}`}>{SCALING_LABELS[s].label}</div>
              <div className="text-lg font-display font-semibold mt-1">{formatEUR(subtotals[s])}</div>
            </CardContent>
          </Card>
        ))}
        <Card className="flex-1 min-w-[140px] border-camino-yellow border-2">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total presupuesto</div>
            <div className="text-lg font-display font-semibold mt-1">{formatEUR(totalAll)}</div>
          </CardContent>
        </Card>
      </div>

      <BudgetByCategory
        items={items ?? []}
        providers={providers ?? []}
        departureId={departureId}
        pagantes={pagantes}
        team={team}
      />
    </div>
  );
}
