import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { EurCop } from "@/components/ui/eur-cop";
import { AddReservation } from "@/components/departures/add-reservation";
import { EditReservationDialog } from "@/components/departures/edit-reservation-dialog";
import { Coffee, UtensilsCrossed, Bed } from "lucide-react";
import { getAlojamientoSlots } from "@/lib/actions/route-template";

export async function StepAlojamientos({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [slots, { data: reservations }, { data: providers }, { data: rooms }] = await Promise.all([
    getAlojamientoSlots(departureId),
    supabase
      .from("reservations")
      .select("*, providers(name)")
      .eq("departure_id", departureId)
      .eq("type", "alojamiento")
      .order("check_in", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
    supabase.from("reservation_rooms").select("*"),
  ]);

  const roomsByRes = new Map<string, any[]>();
  (rooms ?? []).forEach((r: any) => {
    const arr = roomsByRes.get(r.reservation_id) ?? [];
    arr.push(r);
    roomsByRes.set(r.reservation_id, arr);
  });

  // Una noche puede tener varias reservas (dos hoteles, overflow de plazas),
  // así que cada slot lista TODAS las de su fecha, no solo la primera.
  const byDate = new Map<string, any[]>();
  (reservations ?? []).forEach((r: any) => {
    if (!r.check_in) return;
    const arr = byDate.get(r.check_in) ?? [];
    arr.push(r);
    byDate.set(r.check_in, arr);
  });

  const shown = new Set<string>();
  const slotRows = (slots ?? []).map((slot) => {
    const matches = slot.date ? (byDate.get(slot.date) ?? []) : [];
    matches.forEach((r: any) => shown.add(r.id));
    return { slot, matches };
  });
  // Cualquier reserva que no quedó dentro de un slot — por id, no por fecha.
  const extras = (reservations ?? []).filter((r: any) => !shown.has(r.id));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bed className="h-5 w-5" /> Alojamientos del camino</CardTitle>
          <CardDescription>Una reserva por cada noche. Marcá ✓ desayuno / ✓ cena cuando el hotel los incluya.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-3">
            <AddReservation departureId={departureId} providers={providers ?? []} defaultType="alojamiento" />
          </div>

          {(slots ?? []).length === 0 && (reservations ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No hay alojamientos planificados en la plantilla de esta ruta. Agregá uno manualmente con &quot;+ Nueva reserva&quot;.
            </div>
          ) : null}

          <div className="space-y-2">
            {/* Slots de la plantilla — para cada uno mostrar reserva si existe */}
            {slotRows.map(({ slot, matches }, idx) => (
              <div key={idx} className="rounded-md border bg-cream-50/50 p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] bg-cream-100 px-1.5 py-0.5 rounded shrink-0">
                      D{slot.day_offset! >= 0 ? `+${slot.day_offset}` : slot.day_offset}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(slot.date)}</span>
                    <span className="font-medium truncate">{slot.description}</span>
                  </div>
                  {matches.length === 0 && <Badge variant="muted" className="text-[10px]">Sin cargar</Badge>}
                </div>
                {matches.map((reservation: any) => {
                  const rs = roomsByRes.get(reservation.id) ?? [];
                  const beds = rs.reduce((s, r) => s + Number(r.rooms_count) * Number(r.capacity_per_room), 0);
                  const hasBreakfast = rs.some((r) => r.includes_breakfast);
                  const hasDinner = rs.some((r) => r.includes_dinner);
                  return (
                    <div key={reservation.id} className="rounded bg-white/60 px-2 py-1.5 space-y-1">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-sm min-w-0 truncate">{reservation.providers?.name ?? "Sin proveedor"}</span>
                        <div className="flex items-center gap-2">
                          {hasBreakfast && <Coffee className="h-3.5 w-3.5 text-amber-700" />}
                          {hasDinner && <UtensilsCrossed className="h-3.5 w-3.5 text-amber-700" />}
                          <Badge variant={reservation.status === "reservado" ? "accent" : "muted"} className="text-[10px]">{reservation.status}</Badge>
                          <EditReservationDialog reservation={reservation} providers={providers ?? []} departureId={departureId} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{beds} plaza{beds !== 1 ? "s" : ""}</span>
                        <span><EurCop value={reservation.confirmed_cost_eur ?? reservation.estimated_cost_eur} /></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Reservas que no matchean ningún slot — extras */}
            {extras.map((r: any) => {
              const rs = roomsByRes.get(r.id) ?? [];
              const beds = rs.reduce((s, x) => s + Number(x.rooms_count) * Number(x.capacity_per_room), 0);
              return (
                <div key={r.id} className="rounded-md border-2 border-dashed bg-amber-50/30 p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[10px] bg-amber-100 px-1.5 py-0.5 rounded">Extra</span>
                      <span className="text-xs text-muted-foreground">{formatDate(r.check_in)}</span>
                      <span className="font-medium truncate">{r.providers?.name ?? "Reserva extra"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="muted" className="text-[10px]">{r.status}</Badge>
                      <EditReservationDialog reservation={r} providers={providers ?? []} departureId={departureId} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{beds} plaza{beds !== 1 ? "s" : ""}</span>
                    <span><EurCop value={r.confirmed_cost_eur ?? r.estimated_cost_eur} /></span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
