"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { RoomInput } from "@/lib/data/rooms";

function toRow(reservationId: string, r: RoomInput, position: number) {
  return {
    reservation_id: reservationId,
    room_type: r.room_type,
    rooms_count: r.rooms_count,
    capacity_per_room: r.capacity_per_room,
    price_per_room_eur: r.price_per_room_eur,
    includes_breakfast: r.includes_breakfast,
    breakfast_per_person_eur: r.breakfast_per_person_eur,
    includes_dinner: r.includes_dinner,
    dinner_per_person_eur: r.dinner_per_person_eur,
    extra_per_person_eur: r.extra_per_person_eur,
    notes: r.notes ?? null,
    position,
  };
}

/**
 * Guarda el desglose de habitaciones de una reserva.
 *
 * Reutiliza las filas existentes en vez de borrarlas y reinsertarlas: las
 * asignaciones de peregrinos (`room_assignments`) cuelgan de `reservation_rooms.id`
 * con ON DELETE CASCADE, así que un borrado total tumbaría toda la distribución
 * cada vez que alguien corrige un precio. Se emparejan por posición, y solo se
 * sueltan las asignaciones cuando el emparejamiento deja de tener sentido:
 * cambió el tipo de habitación, o se redujo la cantidad y sobran habitaciones.
 */
export async function setReservationRooms(reservationId: string, rooms: RoomInput[], departureId?: string) {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("reservation_rooms")
    .select("id, position, room_type, rooms_count")
    .eq("reservation_id", reservationId)
    .order("position", { ascending: true, nullsFirst: false });

  const prev = existing ?? [];

  for (let i = 0; i < rooms.length; i++) {
    const row = toRow(reservationId, rooms[i], i);
    const old = prev[i];
    if (!old) {
      const { error } = await supabase.from("reservation_rooms").insert(row);
      if (error) throw new Error(error.message);
      continue;
    }
    const { error } = await supabase.from("reservation_rooms").update(row).eq("id", old.id);
    if (error) throw new Error(error.message);

    if (old.room_type !== row.room_type) {
      // La habitación pasó a ser otra cosa: quien estuviera adentro ya no aplica.
      await supabase.from("room_assignments").delete().eq("reservation_room_id", old.id);
    } else if (row.rooms_count < (old.rooms_count ?? 0)) {
      // Se recortaron habitaciones: las que quedaron por encima del tope se vacían.
      await supabase
        .from("room_assignments")
        .delete()
        .eq("reservation_room_id", old.id)
        .gt("room_index", row.rooms_count);
    }
  }

  const sobrantes = prev.slice(rooms.length).map((r) => r.id);
  if (sobrantes.length > 0) {
    const { error } = await supabase.from("reservation_rooms").delete().in("id", sobrantes);
    if (error) throw new Error(error.message);
  }

  // Una habitación con cena incluida prende "pedir menú" (nunca lo apaga sola: eso lo
  // decide el equipo en la reserva, porque hay hoteles con cena fija sin nada que elegir).
  if (rooms.some((r) => r.includes_dinner)) {
    await supabase.from("reservations").update({ menu_required: true }).eq("id", reservationId).eq("menu_required", false);
  }

  if (departureId) revalidatePath(`/caminos/${departureId}`);
}

export async function getReservationRooms(reservationId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("reservation_rooms")
    .select("*")
    .eq("reservation_id", reservationId)
    .order("position", { ascending: true });
  return data ?? [];
}
