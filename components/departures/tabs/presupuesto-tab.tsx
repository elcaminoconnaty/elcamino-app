import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatEUR } from "@/lib/utils";
import { AddBudgetItem } from "@/components/departures/add-budget-item";

export async function PresupuestoTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: items }, { data: providers }] = await Promise.all([
    supabase
      .from("budget_items")
      .select("*, providers(name)")
      .eq("departure_id", departureId)
      .order("category")
      .order("description"),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
  ]);

  const totalEstimated = (items ?? []).reduce((s: number, i: any) => s + Number(i.estimated_total_eur || 0), 0);
  const totalConfirmed = (items ?? []).reduce((s: number, i: any) =>
    s + Number(i.confirmed_unit_cost_eur ? i.confirmed_total_eur : i.estimated_total_eur), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex gap-6 text-sm">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Total estimado</div>
            <div className="font-display text-xl">{formatEUR(totalEstimated)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Total (conf. + estimado)</div>
            <div className="font-display text-xl">{formatEUR(totalConfirmed)}</div>
          </div>
        </div>
        <AddBudgetItem departureId={departureId} providers={providers ?? []} />
      </div>

      <Card>
        <CardContent className="p-0">
          {(!items || items.length === 0) ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Aún no hay items de presupuesto.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Estimado/u</TableHead>
                  <TableHead className="text-right">Confirmado/u</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.category}</TableCell>
                    <TableCell>{i.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.providers?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">{i.quantity} {i.unit ?? ""}</TableCell>
                    <TableCell className="text-right">{formatEUR(i.estimated_unit_cost_eur)}</TableCell>
                    <TableCell className="text-right">{i.confirmed_unit_cost_eur != null ? formatEUR(i.confirmed_unit_cost_eur) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatEUR(i.confirmed_unit_cost_eur != null ? i.confirmed_total_eur : i.estimated_total_eur)}</TableCell>
                    <TableCell><Badge variant={i.status === "pagado" ? "success" : i.status === "confirmado" ? "accent" : "muted"}>{i.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
