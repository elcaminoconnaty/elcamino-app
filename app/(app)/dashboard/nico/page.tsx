import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEUR, formatDate, daysUntil } from "@/lib/utils";
import type { DepartureSummary } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function NicoDashboard() {
  const supabase = createClient();
  const { data: dps } = await supabase
    .from("v_departure_summary")
    .select("*")
    .order("start_date", { ascending: true });

  const departures = (dps as DepartureSummary[]) ?? [];

  const { data: pendingReservations } = await supabase
    .from("reservations")
    .select("id, departure_id, type, location, day_number, status, estimated_cost_eur, provider_id, providers(name)")
    .in("status", ["presupuestado", "contactado", "reservado"])
    .order("day_number", { ascending: true })
    .limit(15);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wider text-camino-deepYellow font-medium">Dashboard de Nico</p>
        <h1 className="font-display text-3xl text-camino-ink">Logística y operación</h1>
        <div className="brand-yellow-bar mt-2" />
      </div>

      <section>
        <h2 className="font-display text-xl text-camino-ink mb-4">Caminos abiertos</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {departures.length === 0 && (
            <Card className="md:col-span-2">
              <CardContent className="py-12 text-center text-muted-foreground">
                No hay caminos. <Link href="/caminos/nuevo" className="underline text-camino-deepYellow">Crear uno</Link>.
              </CardContent>
            </Card>
          )}
          {departures.map((d) => {
            const days = d.start_date ? daysUntil(d.start_date) : null;
            const needsFreeze = days !== null && days <= 30 && days >= 0 && !d.trm_frozen_at_date;
            return (
              <Link key={d.departure_id} href={`/caminos/${d.departure_id}`}>
                <Card className="hover:border-camino-yellow transition-colors h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{d.name}</CardTitle>
                        <CardDescription>
                          {formatDate(d.start_date)}
                          {days !== null && days >= 0 && ` · faltan ${days} días`}
                        </CardDescription>
                      </div>
                      <Badge variant="muted">{d.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Peregrinos</span>
                      <span>{d.pilgrims_count}{d.capacity ? ` / ${d.capacity}` : ""}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Ingresos esperados</span>
                      <span>{formatEUR(d.expected_revenue_eur)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Costo estimado</span>
                      <span>{formatEUR(d.estimated_cost_eur)}</span>
                    </div>
                    {needsFreeze && (
                      <Badge variant="warning" className="mt-2">⚠ Recordá congelar TRM</Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-camino-ink mb-4">Reservas pendientes</h2>
        <Card>
          <CardContent className="p-0">
            {(!pendingReservations || pendingReservations.length === 0) ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No hay reservas pendientes.</div>
            ) : (
              <div className="divide-y">
                {pendingReservations.map((r: any) => (
                  <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{r.providers?.name ?? "Sin proveedor"} · {r.type}</div>
                      <div className="text-xs text-muted-foreground">Día {r.day_number ?? "—"} · {r.location ?? "—"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{formatEUR(r.estimated_cost_eur)}</span>
                      <Badge variant="muted">{r.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
