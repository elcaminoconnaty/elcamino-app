import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatEUR } from "@/lib/utils";
import { EurCop } from "@/components/ui/eur-cop";
import { AddBudgetItem } from "@/components/departures/add-budget-item";
import { EditBudgetItemDialog } from "@/components/departures/edit-budget-item-dialog";
import { getDeparturesDays } from "@/lib/actions/route-template";

type Phase = "pre" | "durante" | "post";

const PHASE_LABELS: Record<Phase, { title: string; icon: string; description: string }> = {
  pre: {
    title: "Viáticos antes del camino",
    icon: "✈️",
    description: "Días pre_camino y llegada. Transportes, hotel, comidas en Madrid/Oporto antes de empezar.",
  },
  durante: {
    title: "Viáticos durante el camino",
    icon: "🥾",
    description: "Almuerzos y gastos personales de Naty y Nico mientras caminan + excursión Finisterre (Francés).",
  },
  post: {
    title: "Viáticos después del camino",
    icon: "🏠",
    description: "Tren de regreso, hotel y comidas en Madrid/Oporto al volver, transportes a casa.",
  },
};

export async function StepViaticos({ departureId, phase }: { departureId: string; phase: Phase }) {
  const supabase = createClient();
  const [days, { data: items }, { data: providers }] = await Promise.all([
    getDeparturesDays(departureId),
    supabase
      .from("budget_items")
      .select("*")
      .eq("departure_id", departureId)
      .eq("scaling", "viatico_team")
      .order("item_date", { ascending: true, nullsFirst: false })
      .order("position"),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
  ]);

  // Filtrar días según fase
  // PRE: pre_camino (Madrid antes del encuentro)
  // DURANTE: llegada (encuentro grupo) + camino + excursion + descanso
  // POST: salida (fin servicios + viaje Madrid) + post_camino
  const phaseDays = days.filter((d) => {
    if (phase === "pre") return d.day_kind === "pre_camino";
    if (phase === "post") return ["salida", "post_camino"].includes(d.day_kind);
    return ["llegada", "camino", "excursion", "descanso"].includes(d.day_kind);
  });

  const phaseInfo = PHASE_LABELS[phase];

  // Agrupar items por fecha
  const itemsByDate = new Map<string, any[]>();
  (items ?? []).forEach((i: any) => {
    const key = i.item_date ?? "sin-fecha";
    const arr = itemsByDate.get(key) ?? [];
    arr.push(i);
    itemsByDate.set(key, arr);
  });

  // Items que matchean alguna fecha de la fase
  const phaseDates = new Set(phaseDays.map((d) => d.date));
  const phaseTotal = (items ?? [])
    .filter((i: any) => phaseDates.has(i.item_date))
    .reduce((s: number, i: any) => s + Number(i.confirmed_unit_cost_eur ?? i.estimated_unit_cost_eur ?? 0) * Number(i.quantity), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>{phaseInfo.icon} {phaseInfo.title}</CardTitle>
            <CardDescription>{phaseInfo.description}</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total fase</div>
            <div className="text-lg font-display"><EurCop value={phaseTotal} /></div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-3">
          <AddBudgetItem
            departureId={departureId}
            providers={providers ?? []}
            forceScaling="viatico_team"
            buttonLabel={phase === "durante" ? "Agregar viático del día" : "Agregar viático"}
          />
        </div>

        {phaseDays.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">No hay días en esta fase. Agregá items con fecha manual.</div>
        ) : (
          <div className="space-y-3">
            {phaseDays.map((d) => {
              const dayItems = itemsByDate.get(d.date) ?? [];
              const dayTotal = dayItems.reduce(
                (s, i) => s + Number(i.confirmed_unit_cost_eur ?? i.estimated_unit_cost_eur ?? 0) * Number(i.quantity),
                0
              );
              return (
                <div key={d.day_offset} className="rounded-md border bg-cream-50/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] bg-cream-100 px-1.5 py-0.5 rounded">
                        D{d.day_offset >= 0 ? `+${d.day_offset}` : d.day_offset}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(d.date)}</span>
                      <span className="text-sm">{d.from_place}{d.to_place ? ` → ${d.to_place}` : ""}</span>
                    </div>
                    <div className="text-sm font-medium"><EurCop value={dayTotal} /></div>
                  </div>
                  {dayItems.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic py-1">Sin items en este día.</div>
                  ) : (
                    <div className="space-y-1">
                      {dayItems.map((i: any) => {
                        const total = Number(i.confirmed_unit_cost_eur ?? i.estimated_unit_cost_eur ?? 0) * Number(i.quantity);
                        return (
                          <div key={i.id} className="flex items-center justify-between text-sm py-1 hover:bg-cream-50 rounded-md px-2 -mx-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="truncate">{i.description}</span>
                                <Badge variant={i.status === "pagado" ? "success" : i.status === "reservado" ? "accent" : "muted"} className="text-[9px]">{i.status}</Badge>
                              </div>
                              {i.quantity > 1 && (
                                <div className="text-xs text-muted-foreground">
                                  {i.quantity} {i.unit ?? "uni"} × {formatEUR(i.confirmed_unit_cost_eur ?? i.estimated_unit_cost_eur)}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-sm"><EurCop value={total} /></span>
                              <EditBudgetItemDialog item={i} providers={providers ?? []} departureId={departureId} lockScaling />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Items sin fecha — siempre visibles */}
            {(items ?? []).filter((i: any) => !i.item_date).length > 0 && (
              <div className="rounded-md border-2 border-dashed bg-amber-50/30 p-3 space-y-2">
                <div className="text-sm font-medium">Sin fecha asignada</div>
                {(items ?? []).filter((i: any) => !i.item_date).map((i: any) => {
                  const total = Number(i.confirmed_unit_cost_eur ?? i.estimated_unit_cost_eur ?? 0) * Number(i.quantity);
                  return (
                    <div key={i.id} className="flex items-center justify-between text-sm py-1">
                      <span>{i.description}</span>
                      <div className="flex items-center gap-1">
                        <EurCop value={total} />
                        <EditBudgetItemDialog item={i} providers={providers ?? []} departureId={departureId} lockScaling />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground mt-4 italic">
          ¿Necesitás más días antes o después? Agregá un viático con fecha manual (anterior o posterior) y la app lo agrupará.
        </div>
      </CardContent>
    </Card>
  );
}
