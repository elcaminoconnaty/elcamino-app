import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEUR, formatDate } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  operativo: "Operativo",
  personal: "Personal",
  pago_proveedor: "Pago proveedor",
};

export async function GastosTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  // Solo gastos sueltos del camino (operativos/personales). Los pagos a proveedores
  // viven en la pestaña Pagos; aquí quedan cosas como marketing o costos operativos.
  const { data: rows } = await supabase
    .from("v_all_movements")
    .select("*")
    .eq("departure_id", departureId)
    .eq("source", "expense")
    .order("movement_date", { ascending: true });

  const total = (rows ?? []).reduce((s: number, r: any) => s + Number(r.amount_eur || 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-cream-50 border px-4 py-2.5 text-xs text-muted-foreground">
        Estos son gastos operativos sueltos del camino. Los <strong>pagos a proveedores</strong> y los <strong>abonos de peregrinos</strong> están en la pestaña <strong>Pagos</strong>.
      </div>
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total otros gastos del camino</div>
          <div className="text-xl font-display">{formatEUR(total)}</div>
        </div>
        <Button asChild variant="accent"><Link href={`/gastos?departure_id=${departureId}`}>Ver/Agregar gastos</Link></Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {(!rows || rows.length === 0) ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No hay otros gastos asignados a este camino.</div>
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
                  <TableRow key={e.row_id}>
                    <TableCell>{formatDate(e.movement_date)}</TableCell>
                    <TableCell>
                      <Badge variant={e.kind === "personal" ? "warning" : e.kind === "pago_proveedor" ? "accent" : "muted"}>{KIND_LABEL[e.kind] ?? e.kind}</Badge>
                      {e.es_viatico && <Badge variant="warning" className="ml-1 text-[10px]">Viático</Badge>}
                    </TableCell>
                    <TableCell>{e.category}</TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell className="text-right">{Number(e.amount).toLocaleString("es-CO")} {e.currency}</TableCell>
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
