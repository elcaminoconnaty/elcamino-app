import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { NewPilgrimDialog } from "@/components/pilgrims/new-pilgrim-dialog";
import { ordenarCaminos } from "@/lib/data/nav-caminos";
import { rutaCamino, rutaPeregrino, rutaPeregrinosDeCamino } from "@/lib/rutas";
import { formatDate } from "@/lib/utils";
import { Download, Map as MapIcon } from "lucide-react";

export const dynamic = "force-dynamic";

type Peregrino = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  is_team: boolean | null;
};

type Grupo = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  peregrinos: (Peregrino & { estado: string })[];
};

export default async function PilgrimsListPage() {
  const supabase = createClient();
  const { data: pilgrims } = await supabase
    .from("pilgrims")
    .select(
      "id, full_name, email, phone, country, is_team, registrations:registrations(id, departure_id, status, departures(id, name, start_date, end_date, status))"
    )
    .is("deleted_at", null)
    .order("full_name");

  // Agrupar por camino: cada camino vigente con sus inscritos; quien no está en ningún
  // camino queda al final. Un peregrino con dos caminos aparece en los dos.
  const grupos = new Map<string, Grupo>();
  const sinCamino: Peregrino[] = [];
  for (const p of (pilgrims ?? []) as any[]) {
    const { registrations, ...datos } = p;
    let enAlguno = false;
    for (const r of registrations ?? []) {
      const d = r.departures;
      if (!d || r.status === "cancelado" || d.status === "cancelled") continue;
      enAlguno = true;
      const g: Grupo = grupos.get(d.id) ?? { id: d.id, name: d.name, start_date: d.start_date, end_date: d.end_date, status: d.status, peregrinos: [] };
      if (!g.peregrinos.some((x) => x.id === p.id)) g.peregrinos.push({ ...datos, estado: r.status });
      grupos.set(d.id, g);
    }
    if (!enAlguno) sinCamino.push(datos);
  }
  const caminos = ordenarCaminos(Array.from(grupos.values()));
  const total = pilgrims?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-noche">Peregrinos</h1>
          <p className="text-sm text-muted-foreground">
            {total} en total · agrupados por camino
          </p>
          <div className="brand-yellow-bar mt-2" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline">
            <a href="/api/export/peregrinos" download>
              <Download className="h-4 w-4" /> Excel
            </a>
          </Button>
          <NewPilgrimDialog />
        </div>
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">Aún no hay peregrinos.</CardContent>
        </Card>
      ) : (
        <>
          {/* Atajos para saltar a cada camino sin hacer scroll. */}
          {caminos.length > 1 && (
            <nav className="flex flex-wrap gap-1.5" aria-label="Ir al camino">
              {caminos.map((c) => (
                <a
                  key={c.id}
                  href={`#camino-${c.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs hover:border-ocre hover:bg-piedra-suave"
                >
                  {c.name}
                  <span className="text-muted-foreground tabular-nums">{c.peregrinos.length}</span>
                </a>
              ))}
              {sinCamino.length > 0 && (
                <a
                  href="#sin-camino"
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs hover:border-ocre hover:bg-piedra-suave"
                >
                  Sin camino <span className="text-muted-foreground tabular-nums">{sinCamino.length}</span>
                </a>
              )}
            </nav>
          )}

          {caminos.map((c) => (
            <section key={c.id} id={`camino-${c.id}`} className="scroll-mt-20 space-y-3">
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h2 className="font-display text-xl text-noche flex items-center gap-2 flex-wrap">
                    <Link href={rutaCamino(c.id)} className="hover:underline">{c.name}</Link>
                    <Badge variant="muted">{c.status}</Badge>
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {formatDate(c.start_date)} – {formatDate(c.end_date)} · {c.peregrinos.length}{" "}
                    {c.peregrinos.length === 1 ? "peregrino" : "peregrinos"}
                  </p>
                </div>
                <Link
                  href={rutaPeregrinosDeCamino(c.id)}
                  className="inline-flex items-center gap-1.5 text-sm text-ocre-profundo hover:underline"
                >
                  <MapIcon className="h-4 w-4" /> Ver en el camino →
                </Link>
              </div>
              <TablaPeregrinos peregrinos={c.peregrinos} caminoId={c.id} />
            </section>
          ))}

          {sinCamino.length > 0 && (
            <section id="sin-camino" className="scroll-mt-20 space-y-3">
              <div>
                <h2 className="font-display text-xl text-noche">Sin camino</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {sinCamino.length} {sinCamino.length === 1 ? "peregrino" : "peregrinos"} sin inscripción vigente
                </p>
              </div>
              <TablaPeregrinos peregrinos={sinCamino} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TablaPeregrinos({
  peregrinos,
  caminoId,
}: {
  peregrinos: (Peregrino & { estado?: string })[];
  caminoId?: string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email / Teléfono</TableHead>
              <TableHead>País</TableHead>
              {caminoId && <TableHead>Estado</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {peregrinos.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={rutaPeregrino(p.id, caminoId)} className="hover:underline font-medium">
                    {p.full_name}
                  </Link>
                  {p.is_team && <Badge variant="muted" className="ml-2 align-middle text-[10px]">equipo</Badge>}
                </TableCell>
                <TableCell className="text-sm">
                  <div>{p.email ?? "—"}</div>
                  <div className="text-muted-foreground">{p.phone ?? "—"}</div>
                </TableCell>
                <TableCell className="text-sm">{p.country ?? "—"}</TableCell>
                {caminoId && (
                  <TableCell>
                    <Badge variant="muted">{p.estado}</Badge>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
