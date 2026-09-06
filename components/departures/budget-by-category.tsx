"use client";
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEUR, formatDate, cn } from "@/lib/utils";
import { SCALING_LABELS, effectiveLineTotal } from "@/lib/finance";
import { CostDonut } from "@/components/departures/cost-donut";
import { AddBudgetItem } from "@/components/departures/add-budget-item";
import { EditBudgetItemDialog } from "@/components/departures/edit-budget-item-dialog";

type Item = any;
type Provider = { id: string; name: string; type: string };

const CATEGORY_ORDER = ["Todo", "Alojamiento", "Cenas", "Comidas", "Transporte", "Equipaje", "Seguros", "Material", "Operativo", "Otro"];

export function BudgetByCategory({
  items,
  providers,
  departureId,
  pagantes,
  team,
}: {
  items: Item[];
  providers: Provider[];
  departureId: string;
  pagantes: number;
  team: number;
}) {
  const [active, setActive] = React.useState("Todo");

  function effectiveTotal(b: Item): number {
    return effectiveLineTotal(b, pagantes, team);
  }

  // Categorías presentes
  const presentCategories = new Set<string>();
  items.forEach((i) => presentCategories.add(i.category));
  const visibleCategories = CATEGORY_ORDER.filter((c) => c === "Todo" || presentCategories.has(c));
  // Agregar las que no están en el orden default
  Array.from(presentCategories).forEach((c) => {
    if (!visibleCategories.includes(c)) visibleCategories.push(c);
  });

  // Totales por categoría
  const totalsByCategory = new Map<string, number>();
  items.forEach((i) => {
    totalsByCategory.set(i.category, (totalsByCategory.get(i.category) ?? 0) + effectiveTotal(i));
  });
  const grandTotal = Array.from(totalsByCategory.values()).reduce((s, v) => s + v, 0);

  const filtered = active === "Todo" ? items : items.filter((i) => i.category === active);
  const donutData = Array.from(totalsByCategory.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      {/* Sub-tabs por categoría */}
      <div className="flex flex-wrap gap-1.5 border-b pb-2">
        {visibleCategories.map((c) => {
          const isActive = active === c;
          const total = c === "Todo" ? grandTotal : totalsByCategory.get(c) ?? 0;
          return (
            <button
              key={c}
              onClick={() => setActive(c)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm transition-colors",
                isActive
                  ? "bg-ocre text-noche font-medium"
                  : "bg-alba text-muted-foreground hover:bg-piedra-suave"
              )}
            >
              {c} {total > 0 && <span className="text-xs opacity-70 ml-1">{formatEUR(total)}</span>}
            </button>
          );
        })}
        <div className="flex-1" />
        <AddBudgetItem departureId={departureId} providers={providers} />
      </div>

      {active === "Todo" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Costo por categoría</CardTitle></CardHeader>
            <CardContent className="p-0">
              <CostDonut data={donutData} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Breakdown</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {donutData.map((d) => {
                const pct = grandTotal > 0 ? Math.round((d.value / grandTotal) * 100) : 0;
                return (
                  <button
                    key={d.name}
                    onClick={() => setActive(d.name)}
                    className="w-full flex items-center justify-between hover:bg-alba rounded-md p-2 -mx-2 text-left"
                  >
                    <span>{d.name}</span>
                    <span>
                      <span className="font-medium">{formatEUR(d.value)}</span>
                      <span className="text-xs text-muted-foreground ml-2">{pct}%</span>
                    </span>
                  </button>
                );
              })}
              <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                <span>Total</span>
                <span>{formatEUR(grandTotal)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No hay items en esta categoría.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Escala</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Estim./u</TableHead>
                    <TableHead className="text-right">Conf./u</TableHead>
                    <TableHead className="text-right">Total efect.</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((i: Item) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(i.item_date)}</TableCell>
                      <TableCell>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider whitespace-nowrap ${SCALING_LABELS[i.scaling]?.color}`}>
                          {SCALING_LABELS[i.scaling]?.label ?? i.scaling}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>{i.description}</div>
                        {i.notes && <div className="text-xs text-muted-foreground mt-0.5">{i.notes}</div>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i.providers?.name ?? "—"}</TableCell>
                      <TableCell className="text-right">{i.quantity} {i.unit ?? ""}</TableCell>
                      <TableCell className="text-right">{formatEUR(i.estimated_unit_cost_eur)}</TableCell>
                      <TableCell className="text-right">{i.confirmed_unit_cost_eur != null ? formatEUR(i.confirmed_unit_cost_eur) : "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatEUR(effectiveTotal(i))}</TableCell>
                      <TableCell><Badge variant={i.status === "pagado" ? "success" : i.status === "reservado" ? "accent" : "muted"}>{i.status}</Badge></TableCell>
                      <TableCell>
                        <EditBudgetItemDialog item={i} providers={providers} departureId={departureId} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
