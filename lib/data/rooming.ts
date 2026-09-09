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

/**
 * Si recibe las habitaciones vigentes, descarta lo que ya no existe (una fila que se
 * borró o se recortó desde la pestaña Reservas): red de seguridad para no mandar al
 * servidor camas de una versión vieja del tablero.
 */
export function assignmentsFromBeds(beds: Beds, slots?: RoomSlot[]): AssignmentInput[] {
  const byKey = slots ? new Map(slots.map((s) => [slotKey(s), s])) : null;
  const out: AssignmentInput[] = [];
  for (const [key, arr] of Object.entries(beds)) {
    const slot = byKey?.get(key);
    if (byKey && !slot) continue;
    const [reservation_room_id, idx] = key.split(":");
    arr.forEach((pilgrim_id, i) => {
      if (!pilgrim_id) return;
      if (slot && i >= slot.capacity) return;
      out.push({ reservation_room_id, room_index: Number(idx), pilgrim_id });
    });
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
export function validateAssignments(
  assignments: AssignmentInput[],
  slots: RoomSlot[],
  optOuts: Iterable<string> = []
): string | null {
  const byKey = new Map(slots.map((s) => [slotKey(s), s]));
  const excluidos = new Set(optOuts);
  const vistos = new Set<string>();
  const porSlot = new Map<string, number>();

  for (const a of assignments) {
    const key = slotKey(a);
    const slot = byKey.get(key);
    if (!slot) return "Hay una habitación que ya no existe en esta reserva";
    if (vistos.has(a.pilgrim_id)) return "Un peregrino quedó en dos habitaciones de la misma noche";
    if (excluidos.has(a.pilgrim_id)) return "Alguien quedó con cama y marcado como que no duerme acá";
    vistos.add(a.pilgrim_id);
    const n = (porSlot.get(key) ?? 0) + 1;
    if (n > slot.capacity) {
      return `La habitación ${slot.room_type} ${a.room_index} tiene más gente que plazas`;
    }
    porSlot.set(key, n);
  }
  return null;
}

/** Quita de los grupos a quienes no duermen esa noche, y descarta los grupos que quedan vacíos. */
export function sinPeregrinos(groups: string[][], excluidos: Iterable<string>): string[][] {
  const ex = new Set(excluidos);
  return groups.map((g) => g.filter((id) => !ex.has(id))).filter((g) => g.length > 0);
}

/**
 * Estado de una noche: quién tiene cama, quién falta, y si está resuelta. Una noche está
 * completa cuando todos los inscritos tienen cama o están marcados como que no duermen ahí.
 */
export function nightProgress(pilgrimIds: string[], beds: Beds, optOuts: Iterable<string>) {
  const ex = new Set(optOuts);
  const asignados = new Set<string>();
  for (const arr of Object.values(beds)) for (const id of arr) if (id) asignados.add(id);
  const sinHabitacion = pilgrimIds.filter((id) => !asignados.has(id) && !ex.has(id));
  const completa = pilgrimIds.length > 0 && sinHabitacion.length === 0;
  return { asignados, sinHabitacion, completa };
}

/**
 * Reacomoda una grilla de camas sobre habitaciones que cambiaron (alguien editó la
 * reserva mientras el tablero estaba abierto). Quien pueda quedarse en su misma cama
 * se queda; los desplazados se mueven en grupo (los que compartían habitación siguen
 * juntos) a lo que haya libre. `cambio` avisa si el resultado difiere de lo que había.
 */
export function reconcileBeds(prev: Beds, slots: RoomSlot[]) {
  const beds = emptyBeds(slots);
  const desplazados: string[][] = [];
  for (const [key, arr] of Object.entries(prev)) {
    const nueva = beds[key];
    const gente = arr.filter(Boolean);
    if (gente.length === 0) continue;
    if (nueva && gente.length <= nueva.length) {
      gente.forEach((id, i) => (nueva[i] = id));
    } else {
      desplazados.push(gente);
    }
  }
  const sinCupo: string[] = [];
  if (desplazados.length > 0) {
    const ocupados = new Set(Object.keys(beds).filter((k) => beds[k].some(Boolean)));
    const libres = slots.filter((s) => !ocupados.has(slotKey(s)));
    const r = placeGroups(desplazados, libres);
    for (const [k, arr] of Object.entries(r.beds)) if (arr.some(Boolean)) beds[k] = arr;
    sinCupo.push(...r.sinCupo);
  }
  const cambio = JSON.stringify(normalizar(prev)) !== JSON.stringify(normalizar(beds));
  return { beds, sinCupo, cambio };
}

function normalizar(beds: Beds) {
  return Object.keys(beds)
    .sort()
    .map((k) => [k, beds[k].filter(Boolean)] as const)
    .filter(([, g]) => g.length > 0);
}

/**
 * Huella estable de lo que manda el servidor para toda la ruta. Si cambia, el tablero
 * tiene que resincronizar su estado local con lo nuevo.
 */
export function nightsSignature(
  nights: { id: string; slots: RoomSlot[]; assignments: any[]; optOuts?: string[] }[]
): string {
  return nights
    .map((n) => {
      const slots = n.slots.map((s) => `${slotKey(s)}=${s.capacity}`).sort().join(",");
      const asg = (n.assignments ?? [])
        .map((a: any) => `${a.reservation_room_id}:${a.room_index}:${a.pilgrim_id}`)
        .sort()
        .join(",");
      const opt = [...(n.optOuts ?? [])].sort().join(",");
      return `${n.id}|${slots}|${asg}|${opt}`;
    })
    .sort()
    .join("\n");
}
