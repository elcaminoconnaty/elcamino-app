import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { NewPilgrimDialog } from "@/components/pilgrims/new-pilgrim-dialog";

export const dynamic = "force-dynamic";

export default async function PilgrimsListPage() {
  const supabase = createClient();
  const { data: pilgrims } = await supabase
    .from("pilgrims")
    .select("*, registrations:registrations(id, departure_id, status, departures(name))")
    .order("full_name");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-camino-ink">Peregrinos</h1>
          <p className="text-sm text-muted-foreground">{pilgrims?.length ?? 0} en total</p>
          <div className="brand-yellow-bar mt-2" />
        </div>
        <NewPilgrimDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          {(!pilgrims || pilgrims.length === 0) ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Aún no hay peregrinos.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email / Teléfono</TableHead>
                  <TableHead>País</TableHead>
                  <TableHead>Caminos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pilgrims.map((p: any) => (
                  <TableRow key={p.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/peregrinos/${p.id}`} className="hover:underline font-medium">{p.full_name}</Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{p.email ?? "—"}</div>
                      <div className="text-muted-foreground">{p.phone ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm">{p.country ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {p.registrations?.map((r: any) => r.departures?.name).filter(Boolean).join(", ") || "—"}
                    </TableCell>
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
