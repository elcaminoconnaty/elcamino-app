import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EurCop } from "@/components/ui/eur-cop";
import { AddBudgetItem } from "@/components/departures/add-budget-item";
import { EditBudgetItemDialog } from "@/components/departures/edit-budget-item-dialog";
import { Users } from "lucide-react";

export async function StepPorPeregrino({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: items }, { data: providers }, { data: finance }] = await Promise.all([
    supabase
      .from("budget_items")
      .select("*")
      .eq("departure_id", departureId)
      .eq("scaling", "por_pagante")
      .order("position"),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
    supabase.from("v_departure_finance").select("pagantes_count").eq("departure_id", departureId).maybeSingle(),
  ]);

  const pagantes = Number((finance as any)?.pagantes_count ?? 0);
  const totalPorPersona = (items ?? []).reduce(
    (s: number, i: any) => s + Number(i.confirmed_unit_cost_eur ?? i.estimated_unit_cost_eur ?? 0),
    0
  );
  const totalGrupo = totalPorPersona * pagantes;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Items por peregrino</CardTitle>
            <CardDescription>
              Servicios que se cobran por cada peregrino pagante: mochilas, materiales, vino, credenciales, seguro.
              Cuando suma un peregrino, el costo crece linealmente.
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Por peregrino</div>
            <div className="text-lg font-display"><EurCop value={totalPorPersona} /></div>
            <div className="text-[10px] text-muted-foreground">× {pagantes} = <EurCop value={totalGrupo} /></div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-3">
          <AddBudgetItem
            departureId={departureId}
            providers={providers ?? []}
            forceScaling="por_pagante"
            buttonLabel="Agregar item por peregrino"
          />
        </div>

        {(!items || items.length === 0) ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            Sin items por peregrino. Aplicá la plantilla desde el paso 1 o agregá manualmente.
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((i: any) => {
              const cost = Number(i.confirmed_unit_cost_eur ?? i.estimated_unit_cost_eur ?? 0);
              return (
                <div key={i.id} className="flex items-center justify-between text-sm py-2 px-2 hover:bg-cream-50 rounded-md">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{i.description}</span>
                      <Badge variant={i.status === "pagado" ? "success" : i.status === "reservado" ? "accent" : "muted"} className="text-[9px]">{i.status}</Badge>
                      <span className="text-xs text-muted-foreground">{i.category}</span>
                    </div>
                    {i.notes && <div className="text-xs text-muted-foreground mt-0.5">{i.notes}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span><EurCop value={cost} /></span>
                    <span className="text-xs text-muted-foreground">/ persona</span>
                    <EditBudgetItemDialog item={i} providers={providers ?? []} departureId={departureId} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
