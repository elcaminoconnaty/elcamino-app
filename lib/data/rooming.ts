/**
 * Reparto de peregrinos en habitaciones. Todo acá es puro: lo usan igual la
 * pantalla (para previsualizar sin ir al servidor) y las server actions
 * (para validar antes de escribir).
 */

export type RoomSlot = {
  reservation_room_id: string;
  /** Cuál de las N habitaciones iguales de la fila (1-indexado). */
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

/** La cama vacía se guarda como "" para que el <select> tenga valor controlado. */
export type Beds = Record<string, string[]>;

export function slotKey(s: { reservation_room_id: string; room_index: number }) {
  return `${s.reservation_room_id}:${s.room_index}`;
}

/** Expande las filas de `reservation_rooms` ("5 dobles") en habitaciones físicas. */
export function expandSlots(rooms: any[]): RoomSlot[] {
  const slots: RoomSlot[] = [];
  for (const r of rooms ?? []) {
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

/** Camas vacías para un conjunto de habitaciones. */
export function emptyBeds(slots: RoomSlot[]): Beds {
  const beds: Beds = {};
  for (const s of slots) beds[slotKey(s)] = Array(s.capacity).fill("");
  return beds;
}

/** Acomoda las asignaciones guardadas en la grilla de camas. */
export function bedsFromAssignments(slots: RoomSlot[], assignments: any[]): Beds {
  const beds = emptyBeds(slots);
  for (const a of assignments ?? []) {
    const arr = beds[`${a.reservation_room_id}:${a.room_index}`];
    if (!arr) continue; // asignación huérfana: la habitación se recortó
    const libre = arr.indexOf("");
    if (libre >= 0) arr[libre] = a.pilgrim_id;
  }
  return beds;
}

export function assignmentsFromBeds(beds: Beds): AssignmentInput[] {
  const out: AssignmentInput[] = [];
  for (const [key, arr] of Object.entries(beds)) {
    const [reservation_room_id, idx] = key.split(":");
    for (const pilgrim_id of arr) {
      if (!pilgrim_id) continue;
      out.push({ reservation_room_id, room_index: Number(idx), pilgrim_id });
    }
  }
  return out;
}

/** Los grupos que duermen juntos, que es lo que se replica de una noche a otra. */
export function groupsFromBeds(beds: Beds): string[][] {
  return Object.values(beds)
    .map((arr) => arr.filter(Boolean))
    .filter((g) => g.length > 0);
}

/**
 * Acomoda grupos de peregrinos en las habitaciones disponibles.
 * Los grupos grandes van primero y toman la habitación más ajustada que les
 * sirva, para no quemar una cuádruple con una pareja. Lo que no cabe se
 * devuelve en `sinCupo` en vez de perderse.
 */
export function placeGroups(groups: string[][], slots: RoomSlot[]) {
  const ordenados = [...groups].sort((a, b) => b.length - a.length);
  const libres = [...slots].sort(
    (a, b) => a.capacity - b.capacity || a.position - b.position || a.room_index - b.room_index
  );
  const usados = new Set<string>();
  const beds = emptyBeds(slots);
  const sinCupo: string[] = [];

  for (const grupo of ordenados) {
    const slot = libres.find((s) => !usados.has(slotKey(s)) && s.capacity >= grupo.length);
    if (!slot) {
      sinCupo.push(...grupo);
      continue;
    }
    usados.add(slotKey(slot));
    const arr = beds[slotKey(slot)];
    grupo.forEach((pilgrimId, i) => (arr[i] = pilgrimId));
  }
  return { beds, sinCupo };
}

/** Reparte una lista de personas llenando las habitaciones más grandes primero. */
export function fillSequentially(pilgrimIds: string[], slots: RoomSlot[]) {
  const orden = [...slots].sort(
    (a, b) => b.capacity - a.capacity || a.position - b.position || a.room_index - b.room_index
  );
  const beds = emptyBeds(slots);
  let i = 0;
  for (const s of orden) {
    const arr = beds[slotKey(s)];
    for (let c = 0; c < s.capacity && i < pilgrimIds.length; c++, i++) arr[c] = pilgrimIds[i];
    if (i >= pilgrimIds.length) break;
  }
  return { beds, sinCupo: pilgrimIds.slice(i) };
}

/**
 * Reglas que tiene que cumplir una distribución antes de guardarse. La UI ya las
 * respeta, pero no es la única puerta de entrada, así que la server action las
 * vuelve a correr contra las habitaciones reales de la base.
 * Devuelve el mensaje del problema, o null si está bien.
 */
export function validateAssignments(assignments: AssignmentInput[], slots: RoomSlot[]): string | null {
  const byKey = new Map(slots.map((s) => [slotKey(s), s]));
  const vistos = new Set<string>();
  const porSlot = new Map<string, number>();

  for (const a of assignments) {
    const key = slotKey(a);
    const slot = byKey.get(key);
    if (!slot) return "Hay una habitación que ya no existe en esta reserva";
    if (vistos.has(a.pilgrim_id)) return "Un peregrino quedó en dos habitaciones de la misma noche";
    vistos.add(a.pilgrim_id);
    const n = (porSlot.get(key) ?? 0) + 1;
    if (n > slot.capacity) {
      return `La habitación ${slot.room_type} ${a.room_index} tiene más gente que plazas`;
    }
    porSlot.set(key, n);
  }
  return null;
}
