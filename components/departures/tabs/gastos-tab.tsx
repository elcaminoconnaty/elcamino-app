import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEUR, formatDate } from "@/lib/utils";

export async function GastosTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const { data: rows } = await supabase
    .from("expenses")
    .select("*")
    .eq("departure_id", departureId)
    .order("expense_date", { ascending: true });

  const total = (rows ?? []).reduce((s: number, r: any) => s + Number(r.amount_eur || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total gastos del camino</div>
          <div className="text-xl font-display">{formatEUR(total)}</div>
        </div>
        <Button asChild variant="accent"><Link href={`/gastos?departure_id=${departureId}`}>Ver/Agregar gastos</Link></Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {(!rows || rows.length === 0) ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No hay gastos asignados a este camino.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">EUR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.expense_date)}</TableCell>
                    <TableCell><Badge variant={e.kind === "personal" ? "warning" : "muted"}>{e.kind}</Badge></TableCell>
                    <TableCell>{e.category}</TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell className="text-right">{e.amount.toLocaleString("es-CO")} {e.currency}</TableCell>
                    <TableCell className="text-right">{formatEUR(e.amount_eur)}</TableCell>
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
