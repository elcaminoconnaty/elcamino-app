"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { ROOM_TYPE_LABELS, type RoomType } from "@/lib/data/rooms";
import {
  getRoomingForReservation,
  getRoomingSources,
  setRoomAssignments,
  copyRoomingFrom,
  autoAssignRooming,
  type AssignmentInput,
  type Slot,
} from "@/lib/actions/room-assignments";
import { BedDouble, Loader2, Users, Wand2, Eraser } from "lucide-react";

type Pilgrim = { id: string; full_name: string; sex: string | null; is_team: boolean };
type Source = { id: string; label: string; asignados: number };

/** La cama vacía se representa con "" para que el <select> tenga un valor controlado. */
type Beds = Record<string, string[]>;

function slotKey(s: { reservation_room_id: string; room_index: number }) {
  return `${s.reservation_room_id}:${s.room_index}`;
}

export function RoomingDialog({
  reservationId,
  departureId,
  providerName,
  triggerLabel,
}: {
  reservationId: string;
  departureId: string;
  providerName?: string | null;
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [pilgrims, setPilgrims] = React.useState<Pilgrim[]>([]);
  const [beds, setBeds] = React.useState<Beds>({});
  const [sources, setSources] = React.useState<Source[]>([]);
  const router = useRouter();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [data, srcs] = await Promise.all([
        getRoomingForReservation(reservationId),
        getRoomingSources(departureId, reservationId),
      ]);
      setSlots(data.slots);
      setPilgrims(data.pilgrims);
      setSources(srcs);

      const next: Beds = {};
      for (const s of data.slots) next[slotKey(s)] = Array(s.capacity).fill("");
      for (const a of data.assignments) {
        const key = `${a.reservation_room_id}:${a.room_index}`;
        const arr = next[key];
        if (!arr) continue; // asignación huérfana: la habitación se recortó
        const free = arr.indexOf("");
        if (free >= 0) arr[free] = a.pilgrim_id;
      }
      setBeds(next);
    } catch (e: any) {
      toast({ title: "No se pudo cargar la distribución", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [reservationId, departureId]);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  const asignados = React.useMemo(() => {
    const set = new Set<string>();
    Object.values(beds).forEach((arr) => arr.forEach((id) => id && set.add(id)));
    return set;
  }, [beds]);

  const sinHabitacion = pilgrims.filter((p) => !asignados.has(p.id));
  const plazas = slots.reduce((s, x) => s + x.capacity, 0);

  function setBed(key: string, index: number, pilgrimId: string) {
    setBeds((prev) => {
      const next: Beds = {};
      for (const [k, arr] of Object.entries(prev)) {
        // Un peregrino solo puede estar en una cama: se saca de donde estuviera antes.
        next[k] = arr.map((id, i) =>
          pilgrimId && id === pilgrimId && !(k === key && i === index) ? "" : id
        );
      }
      next[key] = [...next[key]];
      next[key][index] = pilgrimId;
      return next;
    });
  }

  function toAssignments(): AssignmentInput[] {
    const out: AssignmentInput[] = [];
    for (const s of slots) {
      const arr = beds[slotKey(s)] ?? [];
      for (const pilgrimId of arr) {
        if (!pilgrimId) continue;
        out.push({
          reservation_room_id: s.reservation_room_id,
          room_index: s.room_index,
          pilgrim_id: pilgrimId,
        });
      }
    }
    return out;
  }

  async function save() {
    setSaving(true);
    try {
      await setRoomAssignments(reservationId, toAssignments(), departureId);
      toast({ title: "Distribución guardada", description: `${asignados.size} de ${pilgrims.length} con habitación` });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function copyFrom(sourceId: string) {
    if (!sourceId) return;
    setSaving(true);
    try {
      const r = await copyRoomingFrom(sourceId, reservationId, departureId);
      await load();
      toast({
        title: "Distribución copiada",
        description: r.sinCupo > 0 ? `${r.asignados} acomodados · ${r.sinCupo} sin cupo` : `${r.asignados} acomodados`,
        variant: r.sinCupo > 0 ? undefined : "success",
      });
      router.refresh();
    } catch (e: any) {
      toast({ title: "No se pudo copiar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function autoFill() {
    setSaving(true);
    try {
      const r = await autoAssignRooming(reservationId, departureId);
      await load();
      toast({
        title: "Habitaciones llenadas",
        description: r.sinCupo > 0 ? `${r.asignados} acomodados · faltan plazas para ${r.sinCupo}` : `${r.asignados} acomodados`,
        variant: r.sinCupo > 0 ? undefined : "success",
      });
      router.refresh();
    } catch (e: any) {
      toast({ title: "No se pudo repartir", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function clearAll() {
    setBeds((prev) => {
      const next: Beds = {};
      for (const [k, arr] of Object.entries(prev)) next[k] = arr.map(() => "");
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Distribución de habitaciones" className="h-8 w-8">
          {triggerLabel ? <span className="text-xs">{triggerLabel}</span> : <BedDouble className="h-3.5 w-3.5" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Distribución de habitaciones{providerName ? ` · ${providerName}` : ""}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Cargando…
          </div>
        ) : slots.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Esta reserva no tiene habitaciones desglosadas todavía. Agregalas desde el lápiz de la reserva
            y volvé acá para repartir a la gente.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>
                  <strong>{asignados.size}</strong> de {pilgrims.length} con habitación · {plazas} plazas
                </span>
                {sinHabitacion.length > 0 && (
                  <Badge variant="muted">{sinHabitacion.length} sin asignar</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sources.length > 0 && (
                  <select
                    defaultValue=""
                    disabled={saving}
                    onChange={(e) => {
                      copyFrom(e.target.value);
                      e.target.value = "";
                    }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">Copiar de otra noche…</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>{s.label} ({s.asignados})</option>
                    ))}
                  </select>
                )}
                <Button type="button" variant="outline" size="sm" onClick={autoFill} disabled={saving}>
                  <Wand2 className="h-3 w-3" /> Llenar
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearAll} disabled={saving}>
                  <Eraser className="h-3 w-3" /> Vaciar
                </Button>
              </div>
            </div>

            {sinHabitacion.length > 0 && (
              <div className="rounded-md border border-aviso-200 bg-aviso-50 px-3 py-2 text-xs text-aviso-900">
                <strong>Sin habitación:</strong> {sinHabitacion.map((p) => p.full_name).join(", ")}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {slots.map((s) => {
                const key = slotKey(s);
                const arr = beds[key] ?? [];
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
                        onChange={(e) => setBed(key, i, e.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="">— cama libre —</option>
                        {pilgrims.map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            // Los que ya están en otra cama se ven, pero apagados
                            disabled={p.id !== value && asignados.has(p.id)}
                          >
                            {p.full_name}{p.is_team ? " (equipo)" : ""}
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={saving || loading || slots.length === 0}>
            {saving ? "Guardando…" : "Guardar distribución"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
