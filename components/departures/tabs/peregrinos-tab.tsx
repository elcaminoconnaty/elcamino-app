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
    supabase.from("pilgrims").select("id, full_name, email, phone").order("full_name"),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddPilgrimToDeparture departureId={departureId} pilgrims={allPilgrims ?? []} />
      </div>
      <Card>
        <CardContent className="p-0">
          {(!rows || rows.length === 0) ? (
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
                {rows.map((r: any) => (
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
    </div>
  );
}
