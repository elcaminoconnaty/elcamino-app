import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { EurCop } from "@/components/ui/eur-cop";
import { AddReservation } from "@/components/departures/add-reservation";
import { ImportReservationFromEmail } from "@/components/departures/import-reservation-from-email";
import { EditReservationDialog } from "@/components/departures/edit-reservation-dialog";
import { RegisterReservationPayment } from "@/components/departures/register-reservation-payment";
import { ROOM_TYPE_LABELS } from "@/lib/data/rooms";
import { AlertTriangle, Coffee, UtensilsCrossed } from "lucide-react";
import { formatEUR } from "@/lib/utils";

const SHORT_LABEL: Record<string, string> = {
  individual: "ind",
  doble: "dob",
  triple: "trip",
  cuadruple: "cuad",
  quintuple: "quint",
  grupal: "grupo",
  otro: "otro",
};

export async function ReservasTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: reservations }, { data: providers }, { data: finance }, { data: roomsAll }, { data: paymentsAgg }, { data: assignments }, { data: optOutRows }] = await Promise.all([
    supabase
      .from("reservations")
      .select("*, providers(name, type)")
      .eq("departure_id", departureId)
      .order("check_in", { ascending: true, nullsFirst: false })
      .order("day_number", { ascending: true }),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
    supabase.from("v_departure_finance").select("inscritos_total").eq("departure_id", departureId).maybeSingle(),
    supabase.from("reservation_rooms").select("*").order("position"),
    supabase.from("v_reservation_payments").select("reservation_id, paid_eur, paid_pct, saldo_eur").eq("departure_id", departureId),
    supabase
      .from("room_assignments")
      .select("reservation_id, pilgrim_id, reservations!inner(departure_id)")
      .eq("reservations.departure_id", departureId),
    supabase
      .from("reservation_opt_outs")
      .select("reservation_id, reservations!inner(departure_id)")
      .eq("reservations.departure_id", departureId)
      .eq("kind", "hospedaje"),
  ]);

  const inscritos = Number((finance as any)?.inscritos_total ?? 0);
  const noDuermenEn = new Map<string, number>();
  (optOutRows ?? []).forEach((o: any) => noDuermenEn.set(o.reservation_id, (noDuermenEn.get(o.reservation_id) ?? 0) + 1));
  const roomsByReservation = new Map<string, any[]>();
  (roomsAll ?? []).forEach((r: any) => {
    const arr = roomsByReservation.get(r.reservation_id) ?? [];
    arr.push(r);
    roomsByReservation.set(r.reservation_id, arr);
  });
  const paymentByRes = new Map<string, { paid_eur: number; paid_pct: number; saldo_eur: number }>();
  (paymentsAgg ?? []).forEach((p: any) => {
    paymentByRes.set(p.reservation_id, {
      paid_eur: Number(p.paid_eur ?? 0),
      paid_pct: Number(p.paid_pct ?? 0),
      saldo_eur: Number(p.saldo_eur ?? 0),
    });
  });

  const asignadosPorReserva = new Map<string, number>();
  (assignments ?? []).forEach((a: any) => {
    asignadosPorReserva.set(a.reservation_id, (asignadosPorReserva.get(a.reservation_id) ?? 0) + 1);
  });

  function describeRooms(rooms: any[]): string {
    if (!rooms || rooms.length === 0) return "";
    return rooms
      .map((r) => `${r.rooms_count} ${SHORT_LABEL[r.room_type] ?? r.room_type}${r.rooms_count > 1 ? "s" : ""}`)
      .join(" + ");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <ImportReservationFromEmail departureId={departureId} providers={providers ?? []} />
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
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor / Lugar</TableHead>
                  <TableHead>Habitaciones</TableHead>
                  <TableHead className="text-right">Plazas</TableHead>
                  <TableHead className="text-right">Repartidos</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((r: any) => {
                  const hasInsufficientCapacity = r.beds_count != null && inscritos > 0 && r.beds_count < inscritos;
                  const rooms = roomsByReservation.get(r.id) ?? [];
                  return (
                    <TableRow key={r.id} className={r.is_critical ? "bg-aviso-50" : undefined}>
                      <TableCell>{r.day_number ?? "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <div>{formatDate(r.check_in)}</div>
                        <div className="text-muted-foreground">{formatDate(r.check_out)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium flex items-center gap-1.5">
                          {r.providers?.name ?? "—"}
                          {rooms.some((rr) => rr.includes_breakfast) && <Coffee className="h-3.5 w-3.5 text-aviso-700" />}
                          {(rooms.some((rr) => rr.includes_dinner) || r.meal_kind === "cena") && <UtensilsCrossed className="h-3.5 w-3.5 text-aviso-700" />}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.meal_kind ? `${r.meal_kind} · ${r.meal_persons ?? "?"}p × ${r.meal_price_per_person_eur ?? 0} €` : (r.location ?? r.type)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {rooms.length > 0 ? (
                          <div>{describeRooms(rooms)}</div>
                        ) : r.meal_kind ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="text-muted-foreground">{r.accommodation_type ?? "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div>{r.beds_count ?? "—"}</div>
                        {hasInsufficientCapacity && (
                          <div className="text-[10px] text-error-700 font-medium">⚠ &lt; {inscritos}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {rooms.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          (() => {
                            const asignados = asignadosPorReserva.get(r.id) ?? 0;
                            const esperados = Math.max(inscritos - (noDuermenEn.get(r.id) ?? 0), 0);
                            const completo = esperados > 0 && asignados >= esperados;
                            return (
                              <Link
                                href={`/caminos/${departureId}?tab=habitaciones`}
                                title="Repartir la gente en las habitaciones"
                                className={`text-xs font-medium hover:underline ${completo ? "text-ok-700" : asignados > 0 ? "text-aviso-700" : "text-muted-foreground"}`}
                              >
                                {asignados}{inscritos > 0 ? `/${esperados}` : ""}
                              </Link>
                            );
                          })()
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <EurCop value={r.confirmed_cost_eur ?? r.estimated_cost_eur} />
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {(() => {
                          const pay = paymentByRes.get(r.id);
                          if (!pay || pay.paid_eur === 0) return <span className="text-muted-foreground text-xs">—</span>;
                          const fullyPaid = pay.paid_pct >= 100;
                          return (
                            <div>
                              <div className={`text-xs font-medium ${fullyPaid ? "text-ok-700" : "text-aviso-700"}`}>{pay.paid_pct}%</div>
                              <div className="text-[10px] text-muted-foreground">{formatEUR(pay.paid_eur)}</div>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell><Badge variant={r.status === "pagado" ? "success" : r.status === "reservado" ? "accent" : "muted"}>{r.status}</Badge></TableCell>
                      <TableCell className="max-w-[280px]">
                        <div className="flex items-start gap-1">
                          {(r.is_critical || hasInsufficientCapacity) && <AlertTriangle className="h-3.5 w-3.5 text-aviso-700 mt-0.5 shrink-0" />}
                          <span className="text-xs text-muted-foreground line-clamp-2">{r.notes ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <EditReservationDialog reservation={r} providers={providers ?? []} departureId={departureId} />
                          <RegisterReservationPayment reservation={r} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
