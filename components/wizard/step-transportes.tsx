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
      .order("check_in", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
  ]);

  // Un día puede tener varios transportes (ej. tren del grupo + bus privado),
  // así que cada slot lista TODAS las reservas de su fecha, no solo la primera.
  const byDate = new Map<string, any[]>();
  (reservations ?? []).forEach((r: any) => {
    if (!r.check_in) return;
    const arr = byDate.get(r.check_in) ?? [];
    arr.push(r);
    byDate.set(r.check_in, arr);
  });

  const shown = new Set<string>();
  const slotRows = slots.map((slot) => {
    const matches = slot.date ? (byDate.get(slot.date) ?? []) : [];
    matches.forEach((r: any) => shown.add(r.id));
    return { slot, matches };
  });
  // Cualquier reserva que no quedó dentro de un slot — por id, no por fecha.
  const extras = (reservations ?? []).filter((r: any) => !shown.has(r.id));

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
          <AddReservation departureId={departureId} providers={providers ?? []} defaultType="transporte" />
        </div>

        <div className="space-y-2">
          {slotRows.map(({ slot, matches }, idx) => (
            <div key={idx} className="rounded-md border bg-cream-50/50 p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] bg-cream-100 px-1.5 py-0.5 rounded">D{slot.day_offset! >= 0 ? `+${slot.day_offset}` : slot.day_offset}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(slot.date)}</span>
                  <span className="font-medium truncate">{slot.description}</span>
                </div>
                {matches.length === 0 && <Badge variant="muted" className="text-[10px]">Sin cargar</Badge>}
              </div>
              {matches.length > 0 && (
                <div className="mt-2 space-y-1">
                  {matches.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between flex-wrap gap-2 rounded bg-white/60 px-2 py-1.5">
                      <span className="text-sm min-w-0 truncate">
                        {r.providers?.name ?? "Sin proveedor"}
                        {r.location && <span className="text-xs text-muted-foreground"> · {r.location}</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        <EurCop value={r.confirmed_cost_eur ?? r.estimated_cost_eur} />
                        <Badge variant={r.status === "reservado" ? "accent" : "muted"} className="text-[10px]">{r.status}</Badge>
                        <EditReservationDialog reservation={r} providers={providers ?? []} departureId={departureId} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {slot.notes && <div className="text-xs text-muted-foreground mt-1">{slot.notes}</div>}
            </div>
          ))}

          {extras.map((r: any) => (
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
