import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { RouteQuickCreate } from "@/app/(app)/caminos/nuevo/route-quick-create";
import { FirmaOrganizador } from "@/components/contracts/firma-organizador";
import { EditorEtapas } from "@/components/routes/editor-etapas";
import { Equipo, type Integrante } from "@/components/equipo/equipo";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const supabase = createClient();
  const { data: routes } = await supabase.from("routes").select("*").order("name");
  // Cuántas etapas tiene cada ruta: sin ellas el documento de viaje no arma el itinerario.
  const { data: etapas } = await supabase.from("route_stages").select("route_id");
  const etapasPorRuta = new Map<string, number>();
  for (const e of etapas ?? []) etapasPorRuta.set(e.route_id, (etapasPorRuta.get(e.route_id) ?? 0) + 1);
  const { data: firma } = await supabase
    .from("app_settings").select("value").eq("key", "org_signature").maybeSingle();

  // El equipo. La última entrada vive en auth.users, que solo se lee con la llave de servicio.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, app_role, cedula, password_set_at")
    .not("app_role", "is", null)
    .order("full_name");
  const { data: cuentas } = await createAdminClient().auth.admin.listUsers({ perPage: 100 });
  const ultima = new Map((cuentas?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
  const integrantes: Integrante[] = (perfiles ?? []).map((p) => ({
    id: p.id,
    nombre: p.full_name ?? p.email ?? "Sin nombre",
    rol: p.app_role,
    conCedula: Boolean(p.cedula),
    claveCreada: p.password_set_at,
    ultimaEntrada: ultima.get(p.id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-noche">Configuración</h1>
        <div className="brand-yellow-bar mt-2" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mi firma</CardTitle>
          <CardDescription>
            La firma que va en los contratos por El Camino con Naty. Se captura una vez y se
            usa en todos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FirmaOrganizador yaCapturada={Boolean((firma?.value as any)?.data_url)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rutas</CardTitle>
          <CardDescription>
            Plantillas de rutas del Camino. Cada salida se basa en una ruta, y de sus etapas
            salen el itinerario del documento de viaje, el trazado del mapa y los días del
            presupuesto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-3">
            <RouteQuickCreate />
          </div>
          {(!routes || routes.length === 0) ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Sin rutas.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Días/Noches</TableHead>
                  <TableHead>Km</TableHead>
                  <TableHead>Etapas</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.slug}</TableCell>
                    <TableCell>{r.days ?? "—"} / {r.nights ?? "—"}</TableCell>
                    <TableCell>{r.km ?? "—"}</TableCell>
                    <TableCell>
                      {etapasPorRuta.get(r.id) ? (
                        <span>{etapasPorRuta.get(r.id)}</span>
                      ) : (
                        <span className="text-aviso-700">sin cargar</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <EditorEtapas routeId={r.id} nombreRuta={r.name} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equipo</CardTitle>
          <CardDescription>
            Cada quien entra con su cédula, y lo que registra queda a su nombre en{" "}
            <Link href="/actividad" className="text-ocre-profundo underline underline-offset-2">Actividad</Link>.
            Las cuentas nuevas se crean con <code>scripts/crear-cuenta-equipo.mjs</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Equipo integrantes={integrantes} yo={user?.id ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
