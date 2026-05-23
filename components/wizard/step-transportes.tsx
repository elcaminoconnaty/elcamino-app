import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { EurCop } from "@/components/ui/eur-cop";
import { AddReservation } from "@/components/departures/add-reservation";
import { EditReservationDialog } from "@/components/departures/edit-reservation-dialog";
import { Bus } from "lucide-react";
import { getTransporteSlots } from "@/lib/actions/route-template";

export async function StepTransportes({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [slots, { data: reservations }, { data: providers }] = await Promise.all([
    getTransporteSlots(departureId),
    supabase
      .from("reservations")
      .select("*, providers(name)")
      .eq("departure_id", departureId)
      .eq("type", "transporte")
      .order("check_in", { ascending: true, nullsFirst: false }),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bus className="h-5 w-5" /> Transportes del grupo</CardTitle>
        <CardDescription>
          Transportes que paga la agencia para el grupo: tren con grupo, traslados privados, Finisterre, etc.
          Cada transporte = una reserva tipo &quot;Transporte&quot; con su proveedor y costo total fijo (no por persona).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-3">
          <AddReservation departureId={departureId} providers={providers ?? []} />
        </div>

        <div className="space-y-2">
          {slots.map((slot, idx) => {
            const reservation = (reservations ?? []).find((r: any) => r.check_in === slot.date);
            return (
              <div key={idx} className="rounded-md border bg-cream-50/50 p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] bg-cream-100 px-1.5 py-0.5 rounded">D{slot.day_offset! >= 0 ? `+${slot.day_offset}` : slot.day_offset}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(slot.date)}</span>
                    <span className="font-medium truncate">{slot.description}</span>
                  </div>
                  {reservation ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{reservation.providers?.name}</span>
                      <EurCop value={reservation.confirmed_cost_eur ?? reservation.estimated_cost_eur} />
                      <Badge variant={reservation.status === "reservado" ? "accent" : "muted"} className="text-[10px]">{reservation.status}</Badge>
                      <EditReservationDialog reservation={reservation} providers={providers ?? []} departureId={departureId} />
                    </div>
                  ) : (
                    <Badge variant="muted" className="text-[10px]">Sin cargar</Badge>
                  )}
                </div>
                {slot.notes && <div className="text-xs text-muted-foreground mt-1">{slot.notes}</div>}
              </div>
            );
          })}

          {(reservations ?? []).filter((r: any) => !slots.some((s) => s.date === r.check_in)).map((r: any) => (
            <div key={r.id} className="rounded-md border-2 border-dashed bg-amber-50/30 p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[10px] bg-amber-100 px-1.5 py-0.5 rounded">Extra</span>
                <span className="text-xs text-muted-foreground">{formatDate(r.check_in)}</span>
                <span className="font-medium truncate">{r.providers?.name ?? "Transporte extra"}</span>
              </div>
              <div className="flex items-center gap-2">
                <EurCop value={r.confirmed_cost_eur ?? r.estimated_cost_eur} />
                <Badge variant="muted" className="text-[10px]">{r.status}</Badge>
                <EditReservationDialog reservation={r} providers={providers ?? []} departureId={departureId} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
