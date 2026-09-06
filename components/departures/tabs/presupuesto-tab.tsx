import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatEUR } from "@/lib/utils";
import { SCALING_LABELS, effectiveLineTotal } from "@/lib/finance";
import { BudgetByCategory } from "@/components/departures/budget-by-category";

export async function PresupuestoTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: items }, { data: providers }, { data: finance }] = await Promise.all([
    supabase
      .from("budget_items")
      .select("*, providers(name)")
      .eq("departure_id", departureId)
      .neq("status", "cancelado")
      .order("item_date", { ascending: true, nullsFirst: false })
      .order("category"),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
    supabase.from("v_departure_finance").select("pagantes_count, team_count, costo_total_eur").eq("departure_id", departureId).maybeSingle(),
  ]);

  const pagantes = Number((finance as any)?.pagantes_count ?? 0);
  const team = Number((finance as any)?.team_count ?? 0);

  // Mismas 4 escalas que el wizard (incluye viáticos). El total = costo del wizard (v_departure_finance).
  const subtotals: Record<string, number> = { fijo_grupo: 0, por_inscrito: 0, por_pagante: 0, viatico_team: 0 };
  (items ?? []).forEach((b: any) => {
    subtotals[b.scaling] = (subtotals[b.scaling] ?? 0) + effectiveLineTotal(b, pagantes, team);
  });
  const totalAll = Number((finance as any)?.costo_total_eur ?? Object.values(subtotals).reduce((s, v) => s + v, 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {(["fijo_grupo", "por_inscrito", "por_pagante", "viatico_team"] as const).map((s) => (
          <Card key={s} className="flex-1 min-w-[140px]">
            <CardContent className="p-3">
              <div className={`inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${SCALING_LABELS[s].color}`}>{SCALING_LABELS[s].label}</div>
              <div className="text-lg font-display font-semibold mt-1">{formatEUR(subtotals[s])}</div>
            </CardContent>
          </Card>
        ))}
        <Card className="flex-1 min-w-[140px] border-ocre border-2">
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
