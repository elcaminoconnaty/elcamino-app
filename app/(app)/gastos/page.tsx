import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatEUR } from "@/lib/utils";
import { NewExpenseDialog } from "@/components/expenses/new-expense-dialog";
import { ExpensesFilters } from "@/components/expenses/expenses-filters";

export const dynamic = "force-dynamic";

export default async function GastosPage({ searchParams }: { searchParams: { kind?: string; departure_id?: string } }) {
  const supabase = createClient();
  const { kind, departure_id } = searchParams;

  let q = supabase.from("expenses").select("*, departures(name)").order("expense_date", { ascending: false }).limit(500);
  if (kind) q = q.eq("kind", kind);
  if (departure_id) q = q.eq("departure_id", departure_id);

  const [{ data: expenses }, { data: departures }] = await Promise.all([
    q,
    supabase.from("departures").select("id, name").order("start_date"),
  ]);

  const totalEur = (expenses ?? []).reduce((s: number, e: any) => s + Number(e.amount_eur || 0), 0);
  const totalOp = (expenses ?? []).filter((e: any) => e.kind === "operativo").reduce((s: number, e: any) => s + Number(e.amount_eur || 0), 0);
  const totalPersonal = (expenses ?? []).filter((e: any) => e.kind === "personal").reduce((s: number, e: any) => s + Number(e.amount_eur || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-camino-ink">Gastos y movimientos</h1>
          <p className="text-sm text-muted-foreground">{expenses?.length ?? 0} movimientos</p>
          <div className="brand-yellow-bar mt-2" />
        </div>
        <NewExpenseDialog departures={departures ?? []} defaultDepartureId={departure_id} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div><div className="text-2xl font-display mt-1">{formatEUR(totalEur)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground uppercase tracking-wider">Operativo</div><div className="text-2xl font-display mt-1">{formatEUR(totalOp)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground uppercase tracking-wider">Personal (Naty)</div><div className="text-2xl font-display mt-1">{formatEUR(totalPersonal)}</div></CardContent></Card>
      </div>

      <ExpensesFilters departures={departures ?? []} />

      <Card>
        <CardContent className="p-0">
          {(!expenses || expenses.length === 0) ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Sin gastos.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Camino</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">EUR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.expense_date)}</TableCell>
                    <TableCell><Badge variant={e.kind === "personal" ? "warning" : "muted"}>{e.kind}</Badge></TableCell>
                    <TableCell>{e.category}</TableCell>
                    <TableCell>{e.description ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.departures?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number(e.amount).toLocaleString("es-CO")} {e.currency}</TableCell>
                    <TableCell className="text-right font-medium">{formatEUR(e.amount_eur)}</TableCell>
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
