"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  expandSlots,
  validateAssignments,
  type AssignmentInput,
} from "@/lib/data/rooming";

export type { AssignmentInput };

function revalidateDeparture(departureId?: string | null) {
  if (!departureId) return;
  revalidatePath(`/caminos/${departureId}`);
  revalidatePath(`/caminos/${departureId}/wizard`);
}

/** Los inscritos vigentes del camino, en el orden en que se muestran. */
async function pilgrimsOf(supabase: any, departureId: string) {
  const { data } = await supabase
    .from("registrations")
    .select("status, pilgrims!inner(id, full_name, sex, is_team, deleted_at)")
    .eq("departure_id", departureId)
    .neq("status", "cancelado");
  return (data ?? [])
    .map((r: any) => r.pilgrims)
    .filter((p: any) => p && !p.deleted_at)
    .map((p: any) => ({ id: p.id, full_name: p.full_name, sex: p.sex, is_team: !!p.is_team }))
    .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name, "es"));
}

/** Todo lo que la pantalla de habitaciones necesita para el camino entero. */
export async function getRoomingBoard(departureId: string) {
  const supabase = createClient();

  const [{ data: reservations }, pilgrims] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, day_number, check_in, check_out, location, status, confirmation_ref, providers(id, name, city, address)")
      .eq("departure_id", departureId)
      .eq("type", "alojamiento")
      .neq("status", "cancelado")
      .order("check_in", { ascending: true, nullsFirst: false })
      .order("day_number", { ascending: true }),
    pilgrimsOf(supabase, departureId),
  ]);

  const ids = (reservations ?? []).map((r: any) => r.id);
  if (ids.length === 0) return { nights: [], pilgrims };

  const [{ data: rooms }, { data: assignments }] = await Promise.all([
    supabase
      .from("reservation_rooms")
      .select("id, reservation_id, room_type, rooms_count, capacity_per_room, position, notes")
      .in("reservation_id", ids)
      .order("position", { ascending: true, nullsFirst: false }),
    supabase.from("room_assignments").select("*").in("reservation_id", ids),
  ]);

  const roomsBy = new Map<string, any[]>();
  for (const r of rooms ?? []) roomsBy.set(r.reservation_id, [...(roomsBy.get(r.reservation_id) ?? []), r]);
  const asgBy = new Map<string, any[]>();
  for (const a of assignments ?? []) asgBy.set(a.reservation_id, [...(asgBy.get(a.reservation_id) ?? []), a]);

  const nights = (reservations ?? []).map((r: any) => ({
    id: r.id,
    day_number: r.day_number,
    check_in: r.check_in,
    check_out: r.check_out,
    location: r.location,
    status: r.status,
    confirmation_ref: r.confirmation_ref,
    provider_id: r.providers?.id ?? null,
    provider_name: r.providers?.name ?? "—",
    provider_city: r.providers?.city ?? null,
    slots: expandSlots(roomsBy.get(r.id) ?? []),
    assignments: asgBy.get(r.id) ?? [],
  }));

  return { nights, pilgrims };
}

/** Valida contra las habitaciones reales que hay en la base, no contra las que mandó el cliente. */
async function validate(supabase: any, reservationId: string, assignments: AssignmentInput[]) {
  const { data: rooms } = await supabase
    .from("reservation_rooms")
    .select("id, room_type, rooms_count, capacity_per_room, position")
    .eq("reservation_id", reservationId);
  const problema = validateAssignments(assignments, expandSlots(rooms ?? []));
  if (problema) throw new Error(problema);
}

/**
 * Única escritura de la distribución. La pantalla de habitaciones deja tocar
 * toda la ruta antes de guardar, así que un botón guarda todas las noches que
 * cambiaron; cada una se valida antes de tocar nada, para no dejar la mitad
 * guardada si una viene mal.
 */
export async function saveRoomingBoard(
  departureId: string,
  nights: { reservationId: string; assignments: AssignmentInput[] }[]
) {
  const supabase = createClient();
  for (const n of nights) await validate(supabase, n.reservationId, n.assignments);

  for (const n of nights) {
    const { error: delError } = await supabase.from("room_assignments").delete().eq("reservation_id", n.reservationId);
    if (delError) throw new Error(delError.message);
    if (n.assignments.length === 0) continue;
    const { error } = await supabase.from("room_assignments").insert(
      n.assignments.map((a) => ({
        reservation_id: n.reservationId,
        reservation_room_id: a.reservation_room_id,
        room_index: a.room_index,
        pilgrim_id: a.pilgrim_id,
      }))
    );
    if (error) throw new Error(error.message);
  }

  revalidateDeparture(departureId);
  return { noches: nights.length };
}
