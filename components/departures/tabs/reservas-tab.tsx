import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatEUR, formatDate } from "@/lib/utils";
import { AddReservation } from "@/components/departures/add-reservation";

export async function ReservasTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: reservations }, { data: providers }] = await Promise.all([
    supabase
      .from("reservations")
      .select("*, providers(name, type)")
      .eq("departure_id", departureId)
      .order("day_number", { ascending: true }),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddReservation departureId={departureId} providers={providers ?? []} />
      </div>
      <Card>
        <CardContent className="p-0">
          {(!reservations || reservations.length === 0) ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No hay reservas todavía.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Día</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Tipo / Lugar</TableHead>
                  <TableHead>Check-in / out</TableHead>
                  <TableHead className="text-right">Camas</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.day_number ?? "—"}</TableCell>
                    <TableCell className="font-medium">{r.providers?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div>{r.type}</div>
                      <div className="text-xs text-muted-foreground">{r.location ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{formatDate(r.check_in)}</div>
                      <div className="text-muted-foreground">{formatDate(r.check_out)}</div>
                    </TableCell>
                    <TableCell className="text-right">{r.beds_count ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div>{formatEUR(r.confirmed_cost_eur ?? r.estimated_cost_eur)}</div>
                      {r.confirmed_cost_eur != null && <div className="text-xs text-muted-foreground">est. {formatEUR(r.estimated_cost_eur)}</div>}
                    </TableCell>
                    <TableCell><Badge variant={r.status === "pagado" ? "success" : r.status === "confirmado" ? "accent" : "muted"}>{r.status}</Badge></TableCell>
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
