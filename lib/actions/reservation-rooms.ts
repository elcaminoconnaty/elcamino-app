"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { RoomInput } from "@/lib/data/rooms";

export async function setReservationRooms(reservationId: string, rooms: RoomInput[], departureId?: string) {
  const supabase = createClient();
  await supabase.from("reservation_rooms").delete().eq("reservation_id", reservationId);
  if (rooms.length > 0) {
    const insertRows = rooms.map((r, i) => ({
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
      position: i,
    }));
    const { error } = await supabase.from("reservation_rooms").insert(insertRows);
    if (error) throw new Error(error.message);
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
