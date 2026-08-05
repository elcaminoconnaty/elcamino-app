import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEUR, formatDate } from "@/lib/utils";
import { EurCop } from "@/components/ui/eur-cop";
import { AddBudgetItem } from "@/components/departures/add-budget-item";
import { EditBudgetItemDialog } from "@/components/departures/edit-budget-item-dialog";

export async function ViaticosTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: items }, { data: providers }, { data: finance }, { data: payableRows }] = await Promise.all([
    supabase
      .from("budget_items")
      .select("*")
      .eq("departure_id", departureId)
      .eq("scaling", "viatico_team")
      .order("item_date", { ascending: true, nullsFirst: false })
      .order("category"),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
    supabase.from("v_departure_finance").select("pagantes_count").eq("departure_id", departureId).maybeSingle(),
    supabase.from("v_budget_payable").select("budget_item_id, paid_eur, saldo_eur").eq("departure_id", departureId),
  ]);

  // Pagado / saldo real por ítem (vínculo pago↔presupuesto)
  const payById = new Map<string, { paid: number; saldo: number }>();
  (payableRows ?? []).forEach((p: any) => payById.set(p.budget_item_id, { paid: Number(p.paid_eur || 0), saldo: Number(p.saldo_eur || 0) }));

  const total = (items ?? []).reduce((s: number, i: any) =>
    s + Number(i.confirmed_unit_cost_eur ?? i.estimated_unit_cost_eur ?? 0) * Number(i.quantity), 0);
  const totalPagado = (items ?? []).reduce((s: number, i: any) => s + (payById.get(i.id)?.paid ?? 0), 0);
  const totalSaldo = (items ?? []).reduce((s: number, i: any) => s + (payById.get(i.id)?.saldo ?? 0), 0);
  const pagantes = Number((finance as any)?.pagantes_count ?? 0);
  const perPagante = pagantes > 0 ? total / pagantes : null;
  const perTeam = total / 2;

  // Agrupar por día
  const groups = new Map<string, any[]>();
  (items ?? []).forEach((i: any) => {
    const key = i.item_date ?? "sin-fecha";
    const arr = groups.get(key) ?? [];
    arr.push(i);
    groups.set(key, arr);
  });
  const dayEntries = Array.from(groups.entries()).sort((a, b) => {
    if (a[0] === "sin-fecha") return 1;
    if (b[0] === "sin-fecha") return -1;
    return a[0] < b[0] ? -1 : 1;
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
        <strong>Viáticos del equipo</strong> — gastos personales de Natalia y Nicolás (vuelos, hoteles Madrid antes/después, comidas, transporte). Se reparten entre los peregrinos pagantes al calcular la utilidad.
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total viáticos</div>
            <div className="font-display text-xl mt-1"><EurCop value={total} /></div>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pagado</div>
            <div className="font-display text-xl mt-1 text-green-700"><EurCop value={totalPagado} /></div>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Falta por pagar</div>
            <div className="font-display text-xl mt-1 text-amber-800"><EurCop value={totalSaldo} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Por persona equipo (÷ 2)</div>
            <div className="font-display text-xl mt-1"><EurCop value={perTeam} /></div>
            <div className="text-[10px] text-muted-foreground">Lo que cuesta cada uno (Naty / Nico)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Por pagante actual ({pagantes})</div>
            <div className="font-display text-xl mt-1"><EurCop value={perPagante} /></div>
            <div className="text-[10px] text-muted-foreground">Cuánto se prorratea a cada peregrino</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <AddBudgetItem
          departureId={departureId}
          providers={providers ?? []}
          forceScaling="viatico_team"
          buttonLabel="Agregar viático"
        />
      </div>

      {(items ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Aún no hay viáticos cargados.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dayEntries.map(([dateKey, dayItems]) => {
            const dayTotal = dayItems.reduce((s: number, i: any) =>
              s + Number(i.confirmed_unit_cost_eur ?? i.estimated_unit_cost_eur ?? 0) * Number(i.quantity), 0);
            return (
              <Card key={dateKey}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {dateKey === "sin-fecha" ? "Sin fecha asignada" : formatDate(dateKey)}
                    </CardTitle>
                    <div className="text-sm font-semibold"><EurCop value={dayTotal} /></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  {dayItems.map((i: any) => {
                    const unitCost = Number(i.confirmed_unit_cost_eur ?? i.estimated_unit_cost_eur ?? 0);
                    const t = unitCost * Number(i.quantity);
                    return (
                      <div key={i.id} className="flex items-start justify-between gap-2 py-1.5 text-sm hover:bg-cream-50 rounded-md px-2 -mx-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{i.description}</span>
                            <Badge variant={i.status === "pagado" ? "success" : i.status === "reservado" ? "accent" : "muted"} className="text-[10px]">{i.status}</Badge>
                            <span className="text-xs text-muted-foreground">{i.category}</span>
                          </div>
                          {i.notes && <div className="text-xs text-muted-foreground mt-0.5">{i.notes}</div>}
                          {i.quantity > 1 && (
                            <div className="text-xs text-muted-foreground">{i.quantity} {i.unit ?? "uni"} × {formatEUR(unitCost)}</div>
                          )}
                          {(() => {
                            const pay = payById.get(i.id);
                            if (!pay || pay.paid <= 0) return null;
                            return (
                              <div className="text-xs text-green-700 mt-0.5">
                                Pagado {formatEUR(pay.paid)}{pay.saldo > 0.01 ? ` · falta ${formatEUR(pay.saldo)}` : " · saldado"}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="text-right shrink-0 flex items-start gap-1">
                          <div><EurCop value={t} /></div>
                          <EditBudgetItemDialog item={i} providers={providers ?? []} departureId={departureId} lockScaling />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
