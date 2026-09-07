"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type Slot = {
  reservation_room_id: string;
  room_index: number;
  room_type: string;
  capacity: number;
  position: number;
};

export type AssignmentInput = {
  reservation_room_id: string;
  room_index: number;
  pilgrim_id: string;
};

/** Expande las filas de `reservation_rooms` ("5 dobles") en habitaciones físicas. */
function expandSlots(rooms: any[]): Slot[] {
  const slots: Slot[] = [];
  for (const r of rooms) {
    const count = Math.max(Number(r.rooms_count) || 0, 0);
    for (let i = 1; i <= count; i++) {
      slots.push({
        reservation_room_id: r.id,
        room_index: i,
        room_type: r.room_type,
        capacity: Math.max(Number(r.capacity_per_room) || 1, 1),
        position: Number(r.position ?? 0),
      });
    }
  }
  return slots;
}

function slotKey(s: { reservation_room_id: string; room_index: number }) {
  return `${s.reservation_room_id}:${s.room_index}`;
}

/**
 * Todo lo que la UI necesita para repartir una noche: las habitaciones físicas,
 * quién está inscrito en el camino y quién está ya adentro de cada habitación.
 */
export async function getRoomingForReservation(reservationId: string) {
  const supabase = createClient();
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, departure_id, check_in, check_out, day_number, location, providers(name)")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) throw new Error("La reserva no existe");

  const [{ data: rooms }, { data: registrations }, { data: assignments }] = await Promise.all([
    supabase
      .from("reservation_rooms")
      .select("id, room_type, rooms_count, capacity_per_room, position, notes")
      .eq("reservation_id", reservationId)
      .order("position", { ascending: true, nullsFirst: false }),
    supabase
      .from("registrations")
      .select("status, pilgrims!inner(id, full_name, sex, is_team, deleted_at)")
      .eq("departure_id", (reservation as any).departure_id)
      .neq("status", "cancelado"),
    supabase.from("room_assignments").select("*").eq("reservation_id", reservationId),
  ]);

  const pilgrims = (registrations ?? [])
    .map((r: any) => r.pilgrims)
    .filter((p: any) => p && !p.deleted_at)
    .map((p: any) => ({ id: p.id, full_name: p.full_name, sex: p.sex, is_team: !!p.is_team }))
    .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name, "es"));

  return {
    reservation: reservation as any,
    rooms: rooms ?? [],
    slots: expandSlots(rooms ?? []),
    pilgrims,
    assignments: (assignments ?? []) as any[],
  };
}

/** Otras noches del mismo camino que ya tienen gente repartida, para copiar de ahí. */
export async function getRoomingSources(departureId: string, excludeReservationId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("reservations")
    .select("id, check_in, day_number, location, providers(name), room_assignments(id)")
    .eq("departure_id", departureId)
    .eq("type", "alojamiento")
    .neq("id", excludeReservationId)
    .order("check_in", { ascending: true, nullsFirst: false });

  return (data ?? [])
    .filter((r: any) => (r.room_assignments?.length ?? 0) > 0)
    .map((r: any) => ({
      id: r.id,
      label: `${r.providers?.name ?? "—"}${r.check_in ? ` · ${r.check_in}` : ""}${r.location ? ` (${r.location})` : ""}`,
      asignados: r.room_assignments.length,
    }));
}

/** Reemplaza por completo la distribución de una reserva. */
export async function setRoomAssignments(
  reservationId: string,
  assignments: AssignmentInput[],
  departureId?: string
) {
  const supabase = createClient();

  const { data: rooms } = await supabase
    .from("reservation_rooms")
    .select("id, room_type, rooms_count, capacity_per_room, position")
    .eq("reservation_id", reservationId);
  const slots = expandSlots(rooms ?? []);
  const byKey = new Map(slots.map((s) => [slotKey(s), s]));

  // Validación en el servidor: la UI no es la única puerta de entrada.
  const seenPilgrims = new Set<string>();
  const perSlot = new Map<string, number>();
  for (const a of assignments) {
    const key = slotKey(a);
    const slot = byKey.get(key);
    if (!slot) throw new Error("Hay una habitación que ya no existe en esta reserva");
    if (seenPilgrims.has(a.pilgrim_id)) {
      throw new Error("Un peregrino quedó en dos habitaciones de la misma noche");
    }
    seenPilgrims.add(a.pilgrim_id);
    const n = (perSlot.get(key) ?? 0) + 1;
    if (n > slot.capacity) {
      throw new Error(`La habitación ${slot.room_type} ${a.room_index} tiene más gente que plazas`);
    }
    perSlot.set(key, n);
  }

  const { error: delError } = await supabase
    .from("room_assignments")
    .delete()
    .eq("reservation_id", reservationId);
  if (delError) throw new Error(delError.message);

  if (assignments.length > 0) {
    const { error } = await supabase.from("room_assignments").insert(
      assignments.map((a) => ({
        reservation_id: reservationId,
        reservation_room_id: a.reservation_room_id,
        room_index: a.room_index,
        pilgrim_id: a.pilgrim_id,
      }))
    );
    if (error) throw new Error(error.message);
  }

  if (departureId) {
    revalidatePath(`/caminos/${departureId}`);
    revalidatePath(`/caminos/${departureId}/wizard`);
  }
}

/**
 * Acomoda grupos de peregrinos en las habitaciones disponibles.
 * Los grupos grandes van primero y toman la habitación más ajustada que les
 * sirva, para no quemar una cuádruple con una pareja.
 */
function placeGroups(groups: string[][], slots: Slot[]) {
  const ordered = [...groups].sort((a, b) => b.length - a.length);
  const libres = [...slots].sort((a, b) => a.capacity - b.capacity || a.position - b.position || a.room_index - b.room_index);
  const usados = new Set<string>();
  const result: AssignmentInput[] = [];
  const sinCupo: string[] = [];

  for (const group of ordered) {
    const slot = libres.find((s) => !usados.has(slotKey(s)) && s.capacity >= group.length);
    if (!slot) {
      sinCupo.push(...group);
      continue;
    }
    usados.add(slotKey(slot));
    for (const pilgrimId of group) {
      result.push({
        reservation_room_id: slot.reservation_room_id,
        room_index: slot.room_index,
        pilgrim_id: pilgrimId,
      });
    }
  }
  return { assignments: result, sinCupo };
}

/**
 * Copia las parejas/tríos de otra noche. No copia habitaciones (cada hotel tiene
 * las suyas): copia *quién duerme con quién* y vuelve a acomodar esos grupos en
 * las habitaciones de esta noche.
 */
export async function copyRoomingFrom(
  sourceReservationId: string,
  targetReservationId: string,
  departureId?: string
) {
  const supabase = createClient();

  const [{ data: source }, { data: targetRooms }, { data: targetReg }] = await Promise.all([
    supabase.from("room_assignments").select("reservation_room_id, room_index, pilgrim_id").eq("reservation_id", sourceReservationId),
    supabase.from("reservation_rooms").select("id, room_type, rooms_count, capacity_per_room, position").eq("reservation_id", targetReservationId),
    supabase.from("reservations").select("departure_id").eq("id", targetReservationId).maybeSingle(),
  ]);

  // Los peregrinos de la noche origen que siguen inscritos en este camino
  const { data: registrations } = await supabase
    .from("registrations")
    .select("pilgrim_id")
    .eq("departure_id", (targetReg as any)?.departure_id)
    .neq("status", "cancelado");
  const vigentes = new Set((registrations ?? []).map((r: any) => r.pilgrim_id));

  const grupos = new Map<string, string[]>();
  for (const a of source ?? []) {
    if (!vigentes.has(a.pilgrim_id)) continue;
    const key = `${a.reservation_room_id}:${a.room_index}`;
    grupos.set(key, [...(grupos.get(key) ?? []), a.pilgrim_id]);
  }

  const { assignments, sinCupo } = placeGroups(
    Array.from(grupos.values()),
    expandSlots(targetRooms ?? [])
  );
  await setRoomAssignments(targetReservationId, assignments, departureId);
  return { asignados: assignments.length, sinCupo: sinCupo.length };
}

/** Reparte a todos los inscritos por orden alfabético, llenando cada habitación. */
export async function autoAssignRooming(reservationId: string, departureId?: string) {
  const { slots, pilgrims } = await getRoomingForReservation(reservationId);
  const disponibles = [...slots].sort(
    (a, b) => b.capacity - a.capacity || a.position - b.position || a.room_index - b.room_index
  );

  const assignments: AssignmentInput[] = [];
  let i = 0;
  for (const slot of disponibles) {
    for (let c = 0; c < slot.capacity && i < pilgrims.length; c++, i++) {
      assignments.push({
        reservation_room_id: slot.reservation_room_id,
        room_index: slot.room_index,
        pilgrim_id: pilgrims[i].id,
      });
    }
    if (i >= pilgrims.length) break;
  }

  await setRoomAssignments(reservationId, assignments, departureId);
  return { asignados: assignments.length, sinCupo: pilgrims.length - assignments.length };
}
