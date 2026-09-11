"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { formatDate, cn } from "@/lib/utils";
import { ROOM_TYPE_LABELS, type RoomType } from "@/lib/data/rooms";
import {
  slotKey,
  emptyBeds,
  bedsFromAssignments,
  assignmentsFromBeds,
  groupsFromBeds,
  placeGroups,
  fillSequentially,
  sinPeregrinos,
  nightProgress,
  reconcileBeds,
  nightsSignature,
  type Beds,
  type RoomSlot,
} from "@/lib/data/rooming";
import { useResync } from "@/lib/hooks/use-resync";
import { saveRoomingBoard } from "@/lib/actions/room-assignments";
import {
  BedDouble,
  ChevronDown,
  ChevronRight,
  CopyCheck,
  Download,
  Eraser,
  Save,
  Undo2,
  UserX,
  Wand2,
} from "lucide-react";
import { EnviarRoomingDialog } from "@/components/departures/enviar-rooming-dialog";
import { GmailThreadDialog } from "@/components/departures/gmail-thread-dialog";

type Pilgrim = { id: string; full_name: string; sex: string | null; is_team: boolean };

export type Night = {
  id: string;
  day_number: number | null;
  check_in: string | null;
  check_out: string | null;
  location: string | null;
  status: string | null;
  confirmation_ref: string | null;
  provider_id: string | null;
  provider_name: string;
  provider_city: string | null;
  provider_email: string | null;
  /** El hilo de Gmail enlazado a la reserva, si lo hay. */
  gmail_thread: { threadId: string; subject: string | null } | null;
  rooming_sent_at: string | null;
  slots: RoomSlot[];
  assignments: any[];
  /** Quiénes no duermen esa noche en ese hotel. */
  optOuts: string[];
};

type OptOuts = Record<string, Set<string>>;

function optOutsDe(nights: Night[]): OptOuts {
  return Object.fromEntries(nights.map((n) => [n.id, new Set(n.optOuts ?? [])]));
}

export function RoomingBoard({
  departureId,
  nights,
  pilgrims,
}: {
  departureId: string;
  nights: Night[];
  pilgrims: Pilgrim[];
}) {
  const router = useRouter();
  const [beds, setBeds] = React.useState<Record<string, Beds>>(() =>
    Object.fromEntries(nights.map((n) => [n.id, bedsFromAssignments(n.slots, n.assignments)]))
  );
  const [optOuts, setOptOuts] = React.useState<OptOuts>(() => optOutsDe(nights));
  const [dirty, setDirty] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [abiertas, setAbiertas] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      nights.map((n) => {
        const p = nightProgress(
          pilgrims.map((x) => x.id),
          bedsFromAssignments(n.slots, n.assignments),
          n.optOuts ?? []
        );
        // Las noches ya resueltas arrancan plegadas para no estorbar.
        return [n.id, !(p.asignados.size > 0 && p.completa)];
      })
    )
  );

  const nombres = React.useMemo(
    () => new Map(pilgrims.map((p) => [p.id, p.full_name])),
    [pilgrims]
  );
  const ids = React.useMemo(() => pilgrims.map((p) => p.id), [pilgrims]);

  /**
   * Si otra pestaña editó las habitaciones (o alguien más guardó), el servidor manda
   * `nights` nuevos. Las noches sin cambios locales se recargan tal cual; las que tienen
   * cambios sin guardar se reacomodan sobre las habitaciones nuevas para no perderlos.
   */
  useResync(nightsSignature(nights), () => {
    const avisos: string[] = [];
    setBeds((prev) => {
      const next: Record<string, Beds> = {};
      for (const n of nights) {
        if (dirty.has(n.id) && prev[n.id]) {
          const r = reconcileBeds(prev[n.id], n.slots);
          next[n.id] = r.beds;
          if (r.sinCupo.length > 0) avisos.push(`${r.sinCupo.length} sin cama en ${n.provider_name}`);
        } else {
          next[n.id] = bedsFromAssignments(n.slots, n.assignments);
        }
      }
      return next;
    });
    setOptOuts((prev) => {
      const next: OptOuts = {};
      for (const n of nights) {
        next[n.id] = dirty.has(n.id) && prev[n.id]
          ? new Set(Array.from(prev[n.id]).filter((id) => nombres.has(id)))
          : new Set(n.optOuts ?? []);
      }
      return next;
    });
    setDirty((prev) => new Set(Array.from(prev).filter((id) => nights.some((n) => n.id === id))));
    if (avisos.length > 0) {
      toast({ title: "Cambiaron las habitaciones", description: `${avisos.join(" · ")}. Revisá antes de guardar.` });
    }
  });

  function marcar(nightId: string, next: Beds, nextOptOuts?: Set<string>) {
    setBeds((prev) => ({ ...prev, [nightId]: next }));
    if (nextOptOuts) setOptOuts((prev) => ({ ...prev, [nightId]: nextOptOuts }));
    setDirty((prev) => new Set(prev).add(nightId));
  }

  function setBed(nightId: string, key: string, index: number, pilgrimId: string) {
    const actual = beds[nightId] ?? {};
    const next: Beds = {};
    for (const [k, arr] of Object.entries(actual)) {
      // Un peregrino solo puede estar en una cama de la noche: se saca de donde estuviera.
      next[k] = arr.map((id, i) =>
        pilgrimId && id === pilgrimId && !(k === key && i === index) ? "" : id
      );
    }
    next[key] = [...next[key]];
    next[key][index] = pilgrimId;
    marcar(nightId, next);
  }

  /** Marca o desmarca "no duerme acá". Si tenía cama, se le quita en el mismo paso. */
  function toggleOptOut(nightId: string, pilgrimId: string) {
    const actuales = new Set(optOuts[nightId] ?? []);
    const next: Beds = {};
    for (const [k, arr] of Object.entries(beds[nightId] ?? {})) next[k] = [...arr];
    if (actuales.has(pilgrimId)) {
      actuales.delete(pilgrimId);
    } else {
      actuales.add(pilgrimId);
      for (const arr of Object.values(next)) arr.forEach((id, i) => id === pilgrimId && (arr[i] = ""));
    }
    marcar(nightId, next, actuales);
  }

  function llenar(night: Night) {
    const ex = optOuts[night.id] ?? new Set<string>();
    const { beds: next, sinCupo } = fillSequentially(ids.filter((id) => !ex.has(id)), night.slots);
    marcar(night.id, next);
    if (sinCupo.length > 0) {
      toast({ title: "Faltaron plazas", description: `${sinCupo.length} sin habitación en ${night.provider_name}` });
    }
  }

  function vaciar(night: Night) {
    marcar(night.id, emptyBeds(night.slots));
  }

  function gruposDe(origenId: string, destinoId: string) {
    const grupos = groupsFromBeds(beds[origenId] ?? {}).map((g) => g.filter((id) => nombres.has(id)));
    return sinPeregrinos(grupos, optOuts[destinoId] ?? []);
  }

  /** Copia quién duerme con quién desde otra noche y lo reacomoda acá. */
  function copiarDesde(destino: Night, origenId: string) {
    if (!beds[origenId]) return;
    const { beds: next, sinCupo } = placeGroups(gruposDe(origenId, destino.id), destino.slots);
    marcar(destino.id, next);
    toast({
      title: "Distribución copiada",
      description: sinCupo.length > 0 ? `${sinCupo.length} sin cupo en ${destino.provider_name}` : destino.provider_name,
      variant: sinCupo.length > 0 ? undefined : "success",
    });
  }

  /** Toma los grupos de una noche y los aplica a todas las demás. */
  function replicarATodas(origenId: string) {
    if (!beds[origenId]) return;
    if (groupsFromBeds(beds[origenId]).length === 0) {
      toast({ title: "Esa noche está vacía", description: "Armá primero una noche y después replicala." });
      return;
    }
    const next = { ...beds };
    const nuevasSucias = new Set(dirty);
    let conProblemas = 0;
    for (const n of nights) {
      if (n.id === origenId || n.slots.length === 0) continue;
      const r = placeGroups(gruposDe(origenId, n.id), n.slots);
      next[n.id] = r.beds;
      nuevasSucias.add(n.id);
      if (r.sinCupo.length > 0) conProblemas++;
    }
    setBeds(next);
    setDirty(nuevasSucias);
    toast({
      title: "Replicado a todas las noches",
      description: conProblemas > 0 ? `${conProblemas} noche(s) sin cupo para todos` : "Revisá y guardá",
      variant: conProblemas > 0 ? undefined : "success",
    });
  }

  async function guardar() {
    if (dirty.size === 0) return;
    setSaving(true);
    try {
      const payload = Array.from(dirty).map((id) => {
        const night = nights.find((n) => n.id === id);
        return {
          reservationId: id,
          assignments: assignmentsFromBeds(beds[id] ?? {}, night?.slots),
          optOuts: Array.from(optOuts[id] ?? []),
        };
      });
      const r = await saveRoomingBoard(departureId, payload);
      if (!r.ok) {
        toast({ title: "No se pudo guardar", description: r.error, variant: "destructive" });
        return;
      }
      setDirty(new Set());
      toast({ title: "Guardado", description: `${payload.length} noche(s) actualizadas`, variant: "success" });
      router.refresh();
    } catch {
      toast({
        title: "No se pudo guardar",
        description: "Se cortó la conexión con el servidor. Revisá internet y volvé a intentar.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const nochesConHabitaciones = nights.filter((n) => n.slots.length > 0);
  const completas = nochesConHabitaciones.filter(
    (n) => nightProgress(ids, beds[n.id] ?? {}, optOuts[n.id] ?? []).completa
  ).length;

  if (nights.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Este camino todavía no tiene hospedajes cargados. Agregalos en la pestaña{" "}
          <strong>Reservas</strong> y volvé acá para repartir a la gente.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de estado y acciones globales */}
      <Card className={cn(dirty.size > 0 && "border-ocre border-2")}>
        <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <BedDouble className="h-4 w-4 text-muted-foreground" />
              <span>
                <strong>{completas}</strong> de {nochesConHabitaciones.length} noches repartidas ·{" "}
                {pilgrims.length} peregrinos
              </span>
            </div>
            {dirty.size > 0 && (
              <p className="text-xs text-ocre-profundo mt-1">
                {dirty.size} noche(s) con cambios sin guardar
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              defaultValue=""
              disabled={saving}
              onChange={(e) => {
                if (e.target.value) replicarATodas(e.target.value);
                e.target.value = "";
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
              title="Toma las parejas de esa noche y las acomoda en todas las demás"
            >
              <option value="">Replicar una noche a todas…</option>
              {nochesConHabitaciones.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.provider_name}
                  {n.check_in ? ` · ${n.check_in.slice(5)}` : ""}
                </option>
              ))}
            </select>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/export/caminos/${departureId}/habitaciones`} download>
                <Download className="h-3.5 w-3.5" /> Excel
              </a>
            </Button>
            <Button onClick={guardar} disabled={saving || dirty.size === 0}>
              <Save className="h-4 w-4" />
              {saving ? "Guardando…" : dirty.size > 0 ? `Guardar ${dirty.size}` : "Guardado"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {nights.map((night) => {
        const ex = optOuts[night.id] ?? new Set<string>();
        const progreso = nightProgress(ids, beds[night.id] ?? {}, ex);
        const asignados = progreso.asignados;
        const sinHabitacion = pilgrims.filter((p) => progreso.sinHabitacion.includes(p.id));
        const noDuermen = pilgrims.filter((p) => ex.has(p.id));
        const esperados = pilgrims.length - noDuermen.length;
        const plazas = night.slots.reduce((s, x) => s + x.capacity, 0);
        const completa = progreso.completa;
        const abierta = abiertas[night.id];
        const otras = nochesConHabitaciones.filter(
          (n) => n.id !== night.id && groupsFromBeds(beds[n.id] ?? {}).length > 0
        );

        return (
          <Card key={night.id} className={cn(dirty.has(night.id) && "border-ocre")}>
            <CardContent className="p-0">
              <button
                type="button"
                onClick={() => setAbiertas((p) => ({ ...p, [night.id]: !p[night.id] }))}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {abierta ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {night.day_number != null && (
                        <span className="text-muted-foreground mr-1.5">Día {night.day_number}</span>
                      )}
                      {night.provider_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {formatDate(night.check_in)} → {formatDate(night.check_out)}
                      {night.location ? ` · ${night.location}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {dirty.has(night.id) && <Badge variant="muted">sin guardar</Badge>}
                  {night.slots.length === 0 ? (
                    <Badge variant="muted">sin habitaciones</Badge>
                  ) : (
                    <span
                      className={cn(
                        "text-sm font-medium",
                        completa ? "text-ok-700" : asignados.size > 0 ? "text-aviso-700" : "text-muted-foreground"
                      )}
                    >
                      {asignados.size}/{esperados}
                      {noDuermen.length > 0 && (
                        <span className="text-xs text-muted-foreground font-normal"> · {noDuermen.length} no duerme{noDuermen.length > 1 ? "n" : ""}</span>
                      )}
                    </span>
                  )}
                </div>
              </button>

              {abierta && (
                <div className="border-t px-4 py-3 space-y-3">
                  {night.slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      Esta reserva no tiene habitaciones desglosadas. Agregalas desde la pestaña{" "}
                      <strong>Reservas</strong> (el lápiz de la reserva) y volvé acá.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {night.slots.length} habitaciones · {plazas} plazas
                          {plazas < esperados && (
                            <strong className="text-error-700"> · faltan {esperados - plazas} plazas</strong>
                          )}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {otras.length > 0 && (
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) copiarDesde(night, e.target.value);
                                e.target.value = "";
                              }}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="">Copiar de…</option>
                              {otras.map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.provider_name}
                                  {n.check_in ? ` · ${n.check_in.slice(5)}` : ""}
                                </option>
                              ))}
                            </select>
                          )}
                          <Button type="button" variant="outline" size="sm" onClick={() => llenar(night)}>
                            <Wand2 className="h-3 w-3" /> Llenar
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => vaciar(night)}>
                            <Eraser className="h-3 w-3" /> Vaciar
                          </Button>
                        </div>
                      </div>

                      {sinHabitacion.length > 0 && (
                        <div className="rounded-md border border-aviso-200 bg-aviso-50 px-3 py-2 text-xs text-aviso-900">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <strong>Sin habitación:</strong>
                            {sinHabitacion.map((p) => (
                              <span
                                key={p.id}
                                className="inline-flex items-center gap-1 rounded-full bg-background border border-aviso-200 pl-2 pr-1 py-0.5"
                              >
                                {p.full_name}
                                <button
                                  type="button"
                                  onClick={() => toggleOptOut(night.id, p.id)}
                                  title="No duerme esta noche en este hotel"
                                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] hover:bg-aviso-100"
                                >
                                  <UserX className="h-3 w-3" /> no duerme acá
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {noDuermen.length > 0 && (
                        <div className="rounded-md border bg-alba/60 px-3 py-2 text-xs text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <strong className="text-foreground">No se hospedan:</strong>
                            {noDuermen.map((p) => (
                              <span
                                key={p.id}
                                className="inline-flex items-center gap-1 rounded-full bg-background border pl-2 pr-1 py-0.5"
                              >
                                {p.full_name}
                                <button
                                  type="button"
                                  onClick={() => toggleOptOut(night.id, p.id)}
                                  title="Deshacer: sí duerme acá"
                                  className="inline-flex items-center rounded-full p-0.5 hover:bg-accent/10"
                                >
                                  <Undo2 className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {night.slots.map((s) => {
                          const key = slotKey(s);
                          const arr = beds[night.id]?.[key] ?? [];
                          const ocupadas = arr.filter(Boolean).length;
                          return (
                            <div key={key} className="rounded-md border bg-alba/40 p-2.5 space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">
                                  {ROOM_TYPE_LABELS[s.room_type as RoomType] ?? s.room_type} {s.room_index}
                                </span>
                                <span className={ocupadas === s.capacity ? "text-ok-700" : "text-muted-foreground"}>
                                  {ocupadas}/{s.capacity}
                                </span>
                              </div>
                              {arr.map((value, i) => (
                                <select
                                  key={i}
                                  value={value}
                                  onChange={(e) => setBed(night.id, key, i, e.target.value)}
                                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                >
                                  <option value="">— cama libre —</option>
                                  {pilgrims.map((p) => (
                                    <option
                                      key={p.id}
                                      value={p.id}
                                      disabled={p.id !== value && (asignados.has(p.id) || ex.has(p.id))}
                                    >
                                      {p.full_name}
                                      {p.is_team ? " (equipo)" : ""}
                                      {ex.has(p.id) ? " (no duerme acá)" : ""}
                                    </option>
                                  ))}
                                </select>
                              ))}
                            </div>
                          );
                        })}
                      </div>

                      {night.provider_id && (
                        <div className="pt-1 flex flex-wrap items-center gap-1.5">
                          <EnviarRoomingDialog reservationId={night.id} hotel={night.provider_name} enviadoEl={night.rooming_sent_at} />
                          <GmailThreadDialog reservationId={night.id} departureId={departureId} providerName={night.provider_name} hilo={night.gmail_thread} />
                          <Button asChild variant="ghost" size="sm">
                            <a
                              href={`/api/export/caminos/${departureId}/habitaciones?hotel=${night.provider_id}`}
                              download
                            >
                              <CopyCheck className="h-3 w-3" /> Excel solo de {night.provider_name}
                            </a>
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
