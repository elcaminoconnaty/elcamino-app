"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { pilgrimsOf } from "@/lib/data/pilgrims-of";
import {
  expandSlots,
  validateAssignments,
  type AssignmentInput,
} from "@/lib/data/rooming";

export type { AssignmentInput };

/** Lo que el tablero manda por cada noche que tocó. */
export type NightInput = {
  reservationId: string;
  assignments: AssignmentInput[];
  /** Peregrinos que no duermen esa noche en ese hotel. */
  optOuts: string[];
};

export type SaveResult = { ok: true; noches: number } | { ok: false; error: string };

function revalidateDeparture(departureId?: string | null) {
  if (!departureId) return;
  revalidatePath(`/caminos/${departureId}`);
  revalidatePath(`/caminos/${departureId}/wizard`);
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

  const [{ data: rooms }, { data: assignments }, { data: optOuts }] = await Promise.all([
    supabase
      .from("reservation_rooms")
      .select("id, reservation_id, room_type, rooms_count, capacity_per_room, position, notes")
      .in("reservation_id", ids)
      .order("position", { ascending: true, nullsFirst: false }),
    supabase.from("room_assignments").select("*").in("reservation_id", ids),
    supabase
      .from("reservation_opt_outs")
      .select("reservation_id, pilgrim_id")
      .in("reservation_id", ids)
      .eq("kind", "hospedaje"),
  ]);

  const roomsBy = new Map<string, any[]>();
  for (const r of rooms ?? []) roomsBy.set(r.reservation_id, [...(roomsBy.get(r.reservation_id) ?? []), r]);
  const asgBy = new Map<string, any[]>();
  for (const a of assignments ?? []) asgBy.set(a.reservation_id, [...(asgBy.get(a.reservation_id) ?? []), a]);
  const optBy = new Map<string, string[]>();
  for (const o of optOuts ?? []) optBy.set(o.reservation_id, [...(optBy.get(o.reservation_id) ?? []), o.pilgrim_id]);

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
    optOuts: optBy.get(r.id) ?? [],
  }));

  return { nights, pilgrims };
}

/**
 * Única escritura de la distribución. La pantalla deja tocar toda la ruta antes de
 * guardar, así que un botón guarda todas las noches que cambiaron, en una sola
 * transacción (`save_rooming_board`): si una viene mal, no se toca ninguna.
 *
 * Devuelve el problema como dato y no como excepción: en producción Next.js
 * reemplaza el mensaje de un `throw` por uno genérico, y la gente necesita saber
 * qué hotel y qué habitación fallaron.
 */
export async function saveRoomingBoard(departureId: string, nights: NightInput[]): Promise<SaveResult> {
  const supabase = createClient();
  if (nights.length === 0) return { ok: true, noches: 0 };

  // Prevalidación contra las habitaciones reales, para dar un mensaje con hotel y fecha.
  const ids = nights.map((n) => n.reservationId);
  const [{ data: rooms }, { data: reservas }] = await Promise.all([
    supabase
      .from("reservation_rooms")
      .select("id, reservation_id, room_type, rooms_count, capacity_per_room, position")
      .in("reservation_id", ids),
    supabase.from("reservations").select("id, check_in, providers(name)").in("id", ids),
  ]);
  const roomsBy = new Map<string, any[]>();
  for (const r of rooms ?? []) roomsBy.set(r.reservation_id, [...(roomsBy.get(r.reservation_id) ?? []), r]);
  const nombreDe = new Map<string, string>();
  for (const r of (reservas ?? []) as any[]) {
    nombreDe.set(r.id, [r.providers?.name, r.check_in ? formatDate(r.check_in) : null].filter(Boolean).join(" · "));
  }
  for (const n of nights) {
    const problema = validateAssignments(n.assignments, expandSlots(roomsBy.get(n.reservationId) ?? []), n.optOuts);
    if (problema) return { ok: false, error: `${nombreDe.get(n.reservationId) ?? "Una noche"}: ${problema}` };
  }

  const { error } = await supabase.rpc("save_rooming_board", {
    p_departure_id: departureId,
    p_nights: nights.map((n) => ({
      reservation_id: n.reservationId,
      assignments: n.assignments.map((a) => ({
        reservation_room_id: a.reservation_room_id,
        room_index: a.room_index,
        pilgrim_id: a.pilgrim_id,
      })),
      opt_outs: n.optOuts.map((pilgrim_id) => ({ pilgrim_id })),
    })),
  });
  if (error) return { ok: false, error: error.message };

  revalidateDeparture(departureId);
  return { ok: true, noches: nights.length };
}
