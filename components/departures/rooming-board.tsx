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
  type Beds,
  type RoomSlot,
} from "@/lib/data/rooming";
import { saveRoomingBoard } from "@/lib/actions/room-assignments";
import {
  BedDouble,
  ChevronDown,
  ChevronRight,
  CopyCheck,
  Download,
  Eraser,
  Save,
  Wand2,
} from "lucide-react";

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
  slots: RoomSlot[];
  assignments: any[];
};

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
  const [dirty, setDirty] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [abiertas, setAbiertas] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      nights.map((n) => {
        const asignados = n.assignments.length;
        // Las noches ya resueltas arrancan plegadas para no estorbar.
        return [n.id, !(asignados > 0 && asignados >= pilgrims.length)];
      })
    )
  );

  const nombres = React.useMemo(
    () => new Map(pilgrims.map((p) => [p.id, p.full_name])),
    [pilgrims]
  );

  function asignadosDe(nightId: string) {
    const set = new Set<string>();
    Object.values(beds[nightId] ?? {}).forEach((arr) => arr.forEach((id) => id && set.add(id)));
    return set;
  }

  function marcar(nightId: string, next: Beds) {
    setBeds((prev) => ({ ...prev, [nightId]: next }));
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

  function llenar(night: Night) {
    const { beds: next, sinCupo } = fillSequentially(pilgrims.map((p) => p.id), night.slots);
    marcar(night.id, next);
    if (sinCupo.length > 0) {
      toast({ title: "Faltaron plazas", description: `${sinCupo.length} sin habitación en ${night.provider_name}` });
    }
  }

  function vaciar(night: Night) {
    marcar(night.id, emptyBeds(night.slots));
  }

  /** Copia quién duerme con quién desde otra noche y lo reacomoda acá. */
  function copiarDesde(destino: Night, origenId: string) {
    const origen = beds[origenId];
    if (!origen) return;
    const grupos = groupsFromBeds(origen).map((g) => g.filter((id) => nombres.has(id))).filter((g) => g.length);
    const { beds: next, sinCupo } = placeGroups(grupos, destino.slots);
    marcar(destino.id, next);
    toast({
      title: "Distribución copiada",
      description: sinCupo.length > 0 ? `${sinCupo.length} sin cupo en ${destino.provider_name}` : destino.provider_name,
      variant: sinCupo.length > 0 ? undefined : "success",
    });
  }

  /** Toma los grupos de una noche y los aplica a todas las demás. */
  function replicarATodas(origenId: string) {
    const origen = beds[origenId];
    if (!origen) return;
    const grupos = groupsFromBeds(origen).map((g) => g.filter((id) => nombres.has(id))).filter((g) => g.length);
    if (grupos.length === 0) {
      toast({ title: "Esa noche está vacía", description: "Armá primero una noche y después replicala." });
      return;
    }
    const next = { ...beds };
    const nuevasSucias = new Set(dirty);
    let conProblemas = 0;
    for (const n of nights) {
      if (n.id === origenId || n.slots.length === 0) continue;
      const r = placeGroups(grupos, n.slots);
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
      const payload = Array.from(dirty).map((id) => ({
        reservationId: id,
        assignments: assignmentsFromBeds(beds[id] ?? {}),
      }));
      await saveRoomingBoard(departureId, payload);
      setDirty(new Set());
      toast({ title: "Guardado", description: `${payload.length} noche(s) actualizadas`, variant: "success" });
      router.refresh();
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const nochesConHabitaciones = nights.filter((n) => n.slots.length > 0);
  const completas = nochesConHabitaciones.filter(
    (n) => pilgrims.length > 0 && asignadosDe(n.id).size >= pilgrims.length
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
        const asignados = asignadosDe(night.id);
        const sinHabitacion = pilgrims.filter((p) => !asignados.has(p.id));
        const plazas = night.slots.reduce((s, x) => s + x.capacity, 0);
        const completa = pilgrims.length > 0 && asignados.size >= pilgrims.length;
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
                      {asignados.size}/{pilgrims.length}
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
                          {plazas < pilgrims.length && (
                            <strong className="text-error-700"> · faltan {pilgrims.length - plazas} plazas</strong>
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
                          <strong>Sin habitación:</strong> {sinHabitacion.map((p) => p.full_name).join(", ")}
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
                                      disabled={p.id !== value && asignados.has(p.id)}
                                    >
                                      {p.full_name}
                                      {p.is_team ? " (equipo)" : ""}
                                    </option>
                                  ))}
                                </select>
                              ))}
                            </div>
                          );
                        })}
                      </div>

                      {night.provider_id && (
                        <div className="pt-1">
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
