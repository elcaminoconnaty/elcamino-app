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
  // Con tasa de cierre fijada, el saldo que manda es el liquidado; si no, el histórico.
  const hayCierre = activos.some((r: any) => r.settlement_trm != null);

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
                  {hayCierre && <TableHead className="text-right">Acreditado</TableHead>}
                  <TableHead className="text-right">{hayCierre ? "Saldo EUR" : "Falta EUR"}</TableHead>
                  <TableHead className="text-right">{hayCierre ? "Saldo COP" : "Falta COP (ref.)"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activos.map((r: any) => {
                  const conCierre = r.settlement_trm != null;
                  const saldo = Number(r.saldo_final_eur);
                  const devolver = saldo < -0.5;
                  return (
                    <TableRow key={r.registration_id}>
                      <TableCell>
                        <Link href={`/peregrinos/${r.pilgrim_id}`} className="hover:underline font-medium">{r.pilgrim_name}</Link>
                      </TableCell>
                      <TableCell><Badge variant="muted">{r.status}</Badge></TableCell>
                      <TableCell className="text-right">{formatEUR(r.net_total_eur)}</TableCell>
                      <TableCell className="text-right">{formatEUR(r.paid_eur)}</TableCell>
                      {hayCierre && (
                        <TableCell className="text-right">{conCierre ? formatEUR(r.paid_eur_cierre) : "—"}</TableCell>
                      )}
                      <TableCell className={`text-right ${devolver ? "text-info-800" : ""}`}>
                        {devolver ? `−${formatEUR(Math.abs(saldo))}` : formatEUR(Math.max(0, saldo))}
                      </TableCell>
                      <TableCell className={`text-right ${devolver ? "text-info-800" : "text-muted-foreground"}`}>
                        {conCierre && r.saldo_final_cop != null
                          ? (devolver ? `−${formatCOP(Math.abs(Number(r.saldo_final_cop)))}` : formatCOP(Math.max(0, Number(r.saldo_final_cop))))
                          : formatCOP(r.pending_cop_reference)}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
              Estos abonos siguen contando como ingreso del camino aunque el peregrino ya no viaja, y no entran en la
              liquidación a la tasa de cierre.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
