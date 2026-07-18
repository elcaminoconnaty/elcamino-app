import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatEUR, formatCOP } from "@/lib/utils";
import { AddPilgrimToDeparture } from "@/components/departures/add-pilgrim-to-departure";

export async function PeregrinosTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: rows }, { data: allPilgrims }] = await Promise.all([
    supabase
      .from("v_pilgrim_balance")
      .select("*")
      .eq("departure_id", departureId)
      .order("pilgrim_name", { ascending: true }),
    supabase.from("pilgrims").select("id, full_name, email, phone").is("deleted_at", null).order("full_name"),
  ]);

  const activos = (rows ?? []).filter((r: any) => r.status !== "cancelado");
  const retirados = (rows ?? []).filter((r: any) => r.status === "cancelado");

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddPilgrimToDeparture departureId={departureId} pilgrims={allPilgrims ?? []} />
      </div>
      <Card>
        <CardContent className="p-0">
          {activos.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Aún no hay peregrinos en este camino.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Peregrino</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Falta EUR</TableHead>
                  <TableHead className="text-right">Falta COP (ref.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activos.map((r: any) => (
                  <TableRow key={r.registration_id}>
                    <TableCell>
                      <Link href={`/peregrinos/${r.pilgrim_id}`} className="hover:underline font-medium">{r.pilgrim_name}</Link>
                    </TableCell>
                    <TableCell><Badge variant="muted">{r.status}</Badge></TableCell>
                    <TableCell className="text-right">{formatEUR(r.net_total_eur)}</TableCell>
                    <TableCell className="text-right">{formatEUR(r.paid_eur)}</TableCell>
                    <TableCell className="text-right">{formatEUR(r.pending_eur)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCOP(r.pending_cop_reference)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {retirados.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-2">Retirados (abonos retenidos)</div>
            <div className="space-y-1">
              {retirados.map((r: any) => (
                <div key={r.registration_id} className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    {r.pilgrim_name}
                    {r.refund_status === "sin_reembolso" && <Badge variant="muted" className="ml-2">sin reembolso</Badge>}
                  </span>
                  <span>abonó {formatEUR(r.paid_eur)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Estos abonos siguen contando como ingreso del camino aunque el peregrino ya no viaja.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
