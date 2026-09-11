import "server-only";
import * as XLSX from "xlsx";
import { appendSheet, appendAoaSheet, fileSlug, sheetName } from "@/lib/export";
import { ROOM_TYPE_LABELS, type RoomType } from "@/lib/data/rooms";

/**
 * El rooming list: la lista de quién duerme en qué habitación, por hotel. La arma la
 * ruta de exportación (Excel completo del camino) y el correo al hotel (una hoja + la
 * tabla en el cuerpo), así que vive acá y no en el route handler.
 */

export type FilaRooming = any;

export function roomLabel(t: string) {
  return ROOM_TYPE_LABELS[t as RoomType] ?? t;
}

/** "Doble 2" — el nombre con el que se le habla al hotel. */
export function roomName(r: FilaRooming) {
  return `${roomLabel(r.room_type)} ${r.room_index}`;
}

/** Etiqueta corta de una noche, para encabezar columnas de la matriz. */
function nightLabel(r: FilaRooming) {
  const fecha = r.check_in ? String(r.check_in).slice(5) : "";
  return [r.day_number != null ? `D${r.day_number}` : null, fecha, r.provider_name].filter(Boolean).join(" · ");
}

function roomKey(r: FilaRooming) {
  return `${r.reservation_room_id}:${r.room_index}`;
}

/** Agrupa filas de la vista por habitación física, conservando el orden de entrada. */
export function byRoom(rows: FilaRooming[]) {
  const m = new Map<string, FilaRooming[]>();
  for (const r of rows) m.set(roomKey(r), [...(m.get(roomKey(r)) ?? []), r]);
  return m;
}

export type Huesped = { nombre: string; pasaporte: string | null; dieta: string | null };
export type HabitacionRooming = { nombre: string; capacidad: number; huespedes: Huesped[]; desayuno: boolean; cena: boolean; notas: string | null };

/** Las habitaciones de un grupo de filas (una reserva o un hotel), listas para pintar. */
export function habitacionesDe(rows: FilaRooming[]): HabitacionRooming[] {
  return Array.from(byRoom(rows).values()).map((grupo) => {
    const h = grupo[0];
    return {
      nombre: roomName(h),
      capacidad: Number(h.capacity_per_room) || 1,
      huespedes: grupo
        .filter((x) => x.pilgrim_id)
        .map((x) => ({ nombre: String(x.pilgrim_name), pasaporte: x.passport_number ?? null, dieta: x.dietary_notes ?? null })),
      desayuno: !!h.includes_breakfast,
      cena: !!h.includes_dinner,
      notas: h.room_notes ?? null,
    };
  });
}

/**
 * La hoja que se le manda al hotel: encabezado con sus datos y una fila por habitación
 * con los huéspedes y su pasaporte en columnas, que es el formato que esperan recibir.
 */
export function hotelSheet(rows: FilaRooming[], caminoNombre: string, noSeHospedan: Map<string, string[]>): (string | number)[][] {
  const r0 = rows[0];
  const habitaciones = byRoom(rows);
  const maxCapacidad = Math.max(...Array.from(habitaciones.values()).map((g) => Number(g[0].capacity_per_room) || 1), 1);

  const aoa: (string | number)[][] = [];
  aoa.push([r0.provider_name ?? ""]);
  const ubicacion = [r0.provider_address, r0.location ?? r0.provider_city].filter(Boolean).join(" · ");
  if (ubicacion) aoa.push([ubicacion]);
  const contacto = [r0.provider_phone, r0.provider_email].filter(Boolean).join(" · ");
  if (contacto) aoa.push([contacto]);
  aoa.push([caminoNombre]);

  const refs = Array.from(new Set(rows.map((r) => r.confirmation_ref).filter(Boolean)));
  if (refs.length > 0) aoa.push([`Reserva: ${refs.join(", ")}`]);

  const personas = new Set(rows.filter((r) => r.pilgrim_id).map((r) => r.pilgrim_id)).size;
  const plazas = Array.from(habitaciones.values()).reduce((s, g) => s + (Number(g[0].capacity_per_room) || 0), 0);
  aoa.push([`${habitaciones.size} habitaciones · ${plazas} plazas · ${personas} personas`]);
  aoa.push([]);

  const cabecera = ["Día", "Check-in", "Check-out", "Habitación", "Capacidad"];
  for (let i = 1; i <= maxCapacidad; i++) cabecera.push(`Huésped ${i}`, `Pasaporte ${i}`);
  cabecera.push("Desayuno", "Cena", "Notas");
  aoa.push(cabecera);

  for (const grupo of Array.from(habitaciones.values())) {
    const h = grupo[0];
    const huespedes = grupo.filter((x) => x.pilgrim_id);
    const fila: (string | number)[] = [h.day_number ?? "", h.check_in ?? "", h.check_out ?? "", roomName(h), h.capacity_per_room ?? ""];
    for (let i = 0; i < maxCapacidad; i++) fila.push(huespedes[i]?.pilgrim_name ?? "", huespedes[i]?.passport_number ?? "");
    fila.push(h.includes_breakfast ? "Sí" : "No", h.includes_dinner ? "Sí" : "No", h.room_notes ?? "");
    aoa.push(fila);
  }

  // Quienes no se hospedan alguna de estas noches: el hotel no los espera.
  const reservasDelHotel = Array.from(new Set(rows.map((r) => r.reservation_id)));
  const excluidos = reservasDelHotel.flatMap((id) => {
    const nombres = noSeHospedan.get(id) ?? [];
    if (nombres.length === 0) return [];
    const fecha = rows.find((r) => r.reservation_id === id)?.check_in ?? "";
    return [`${reservasDelHotel.length > 1 && fecha ? `${fecha}: ` : ""}${nombres.join(", ")}`];
  });
  if (excluidos.length > 0) {
    aoa.push([]);
    aoa.push(["No se hospedan", ...excluidos]);
  }

  // Notas dietarias: lo que el hotel necesita saber antes de cocinar.
  const dietas = rows.filter((r) => r.pilgrim_id && r.dietary_notes);
  if (dietas.length > 0) {
    aoa.push([]);
    aoa.push(["Alimentación"]);
    for (const d of dietas) aoa.push([d.pilgrim_name, d.dietary_notes]);
  }

  return aoa;
}

export type DatosRooming = {
  caminoNombre: string;
  /** Filas de v_rooming_list, ya ordenadas. */
  rows: FilaRooming[];
  /** Reservas de alojamiento (con o sin habitaciones desglosadas). */
  alojamientos: any[];
  /** reservation_id → nombres de quienes no duermen esa noche. */
  noSeHospedan: Map<string, string[]>;
};

/** Carga todo lo que hace falta para el rooming list de un camino. `null` si el camino no existe. */
export async function cargarRooming(supabase: any, departureId: string): Promise<DatosRooming | null> {
  const [{ data: departure }, { data: rooming }, { data: alojamientos }] = await Promise.all([
    supabase.from("departures").select("id, name, start_date, end_date").eq("id", departureId).maybeSingle(),
    supabase.from("v_rooming_list").select("*").eq("departure_id", departureId),
    // v_rooming_list solo trae reservas con habitaciones desglosadas. Las que no
    // las tienen se piden aparte: si no, un hotel reservado desaparece del Excel
    // sin que nadie se entere.
    supabase
      .from("reservations")
      .select("id, day_number, check_in, check_out, location, status, confirmation_ref, notes, providers(id, name, city, address, phone, email)")
      .eq("departure_id", departureId)
      .eq("type", "alojamiento")
      .neq("status", "cancelado"),
  ]);
  if (!departure) return null;

  const { data: optOuts } = await supabase
    .from("reservation_opt_outs")
    .select("reservation_id, pilgrims(full_name)")
    .in("reservation_id", (alojamientos ?? []).map((r: any) => r.id))
    .eq("kind", "hospedaje");
  const noSeHospedan = new Map<string, string[]>();
  for (const o of (optOuts ?? []) as any[]) {
    const nombre = o.pilgrims?.full_name;
    if (!nombre) continue;
    noSeHospedan.set(o.reservation_id, [...(noSeHospedan.get(o.reservation_id) ?? []), nombre].sort((a, b) => a.localeCompare(b, "es")));
  }

  const rows = ((rooming ?? []) as FilaRooming[]).sort(
    (a, b) =>
      String(a.check_in ?? "9999").localeCompare(String(b.check_in ?? "9999")) ||
      (a.provider_name ?? "").localeCompare(b.provider_name ?? "", "es") ||
      (a.room_position ?? 0) - (b.room_position ?? 0) ||
      a.room_index - b.room_index ||
      (a.pilgrim_name ?? "").localeCompare(b.pilgrim_name ?? "", "es")
  );
  return { caminoNombre: (departure as any).name as string, rows, alojamientos: alojamientos ?? [], noSeHospedan };
}

/** Las filas de un hotel (por proveedor) o de una sola reserva. */
export function filasDe(datos: DatosRooming, filtro: { hotelId?: string | null; reservationId?: string | null }): FilaRooming[] {
  return datos.rows.filter((r) => (!filtro.hotelId || r.provider_id === filtro.hotelId) && (!filtro.reservationId || r.reservation_id === filtro.reservationId));
}

/** El libro de un solo hotel: una pestaña, con el nombre de archivo que se le manda. */
export function libroDeHotel(datos: DatosRooming, filas: FilaRooming[]): { wb: XLSX.WorkBook; filename: string; buffer: Buffer } | null {
  if (filas.length === 0) return null;
  const wb = XLSX.utils.book_new();
  appendAoaSheet(wb, sheetName(filas[0].provider_name ?? "Hotel"), hotelSheet(filas, datos.caminoNombre, datos.noSeHospedan));
  const filename = `rooming-${fileSlug(filas[0].provider_name ?? "hotel")}-${fileSlug(datos.caminoNombre)}.xlsx`;
  return { wb, filename, buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer };
}

/** El libro completo del camino: resumen, una pestaña por hotel, distribución y matriz. */
export function libroCompleto(datos: DatosRooming): { wb: XLSX.WorkBook; filename: string } {
  const { rows, caminoNombre, noSeHospedan, alojamientos } = datos;
  const wb = XLSX.utils.book_new();

  const porHotel = new Map<string, FilaRooming[]>();
  for (const r of rows) {
    const key = r.provider_id ?? r.provider_name ?? "sin-hotel";
    porHotel.set(key, [...(porHotel.get(key) ?? []), r]);
  }

  // ── Hoja 1: resumen por noche, el panorama de la ruta ─────────────────────
  const porNoche = new Map<string, FilaRooming[]>();
  for (const r of rows) porNoche.set(r.reservation_id, [...(porNoche.get(r.reservation_id) ?? []), r]);

  const noches = Array.from(porNoche.values()).map((group) => {
    const r = group[0];
    const habitaciones = byRoom(group);
    const conGente = Array.from(habitaciones.entries()).filter(([, g]) => g.some((x) => x.pilgrim_id));
    const plazas = Array.from(habitaciones.values()).reduce((s, g) => s + Number(g[0].capacity_per_room ?? 0), 0);
    const personas = new Set(group.filter((x) => x.pilgrim_id).map((x) => x.pilgrim_id)).size;
    const tipos = new Map<string, number>();
    for (const [, g] of conGente) {
      const t = roomLabel(g[0].room_type);
      tipos.set(t, (tipos.get(t) ?? 0) + 1);
    }
    return {
      "Día": r.day_number ?? "",
      "Check-in": r.check_in ?? "",
      "Check-out": r.check_out ?? "",
      "Hospedaje": r.provider_name ?? "",
      "Ciudad": r.location ?? r.provider_city ?? "",
      "Dirección": r.provider_address ?? "",
      "Teléfono hotel": r.provider_phone ?? "",
      "Email hotel": r.provider_email ?? "",
      "Hora check-in": r.check_in_time ?? "",
      "Hora desayuno": r.breakfast_time ?? "",
      "Habitaciones reservadas": habitaciones.size,
      "Habitaciones en uso": conGente.length,
      "Desglose en uso": Array.from(tipos.entries()).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(" + "),
      "Plazas": plazas,
      "Personas asignadas": personas,
      "Plazas libres": Math.max(plazas - personas, 0),
      "No se hospedan": (noSeHospedan.get(r.reservation_id) ?? []).join(", "),
      "Estado": r.reservation_status ?? "",
      "Reserva": r.confirmation_ref ?? "",
      "Notas": r.reservation_notes ?? "",
    };
  });
  const conDesglose = new Set(rows.map((r) => r.reservation_id));
  for (const r of alojamientos as any[]) {
    if (conDesglose.has(r.id)) continue;
    noches.push({
      "Día": r.day_number ?? "",
      "Check-in": r.check_in ?? "",
      "Check-out": r.check_out ?? "",
      "Hospedaje": r.providers?.name ?? "",
      "Ciudad": r.location ?? r.providers?.city ?? "",
      "Dirección": r.providers?.address ?? "",
      "Teléfono hotel": r.providers?.phone ?? "",
      "Email hotel": r.providers?.email ?? "",
      "Hora check-in": "",
      "Hora desayuno": "",
      "Habitaciones reservadas": 0,
      "Habitaciones en uso": 0,
      "Desglose en uso": "⚠ sin habitaciones desglosadas — no se puede repartir",
      "Plazas": 0,
      "Personas asignadas": 0,
      "Plazas libres": 0,
      "No se hospedan": (noSeHospedan.get(r.id) ?? []).join(", "),
      "Estado": r.status ?? "",
      "Reserva": r.confirmation_ref ?? "",
      "Notas": r.notes ?? "",
    });
  }
  noches.sort((a, b) => String(a["Check-in"] || "9999").localeCompare(String(b["Check-in"] || "9999")));
  appendSheet(wb, "Resumen", noches, "Este camino no tiene habitaciones cargadas.");

  // Una pestaña por hotel, en el orden en que aparecen en la ruta
  const usadas = new Map<string, number>();
  for (const grupo of Array.from(porHotel.values())) {
    let nombre = sheetName(grupo[0].provider_name ?? "Hotel");
    const n = (usadas.get(nombre) ?? 0) + 1;
    usadas.set(nombre, n);
    if (n > 1) nombre = sheetName(`${nombre} ${n}`);
    appendAoaSheet(wb, nombre, hotelSheet(grupo, caminoNombre, noSeHospedan));
  }

  // ── Vistas transversales, para Naty ──────────────────────────────────────
  const distribucion = rows.map((r) => ({
    "Día": r.day_number ?? "",
    "Check-in": r.check_in ?? "",
    "Check-out": r.check_out ?? "",
    "Hospedaje": r.provider_name ?? "",
    "Ciudad": r.location ?? r.provider_city ?? "",
    "Habitación": roomName(r),
    "Capacidad": r.capacity_per_room ?? "",
    "Peregrino": r.pilgrim_name ?? "— libre —",
    "Pasaporte": r.passport_number ?? "",
    "Sexo": r.sex ?? "",
    "Equipo": r.is_team ? "Sí" : "",
    "Teléfono": r.pilgrim_phone ?? "",
    "Alimentación": r.dietary_notes ?? "",
    "Desayuno": r.includes_breakfast ? "Sí" : "No",
    "Cena": r.includes_dinner ? "Sí" : "No",
    "Reserva": r.confirmation_ref ?? "",
    "Notas habitación": r.room_notes ?? "",
    "Aviso": r.fuera_de_rango ? "Habitación fuera del cupo reservado" : "",
  }));
  appendSheet(wb, "Distribución", distribucion, "Este camino no tiene habitaciones cargadas.");

  const usadosLabel = new Map<string, number>();
  const nochesOrdenadas = Array.from(porNoche.values()).map((g) => {
    const base = nightLabel(g[0]);
    const n = (usadosLabel.get(base) ?? 0) + 1;
    usadosLabel.set(base, n);
    return { id: g[0].reservation_id, label: n === 1 ? base : `${base} (${n})` };
  });
  const peregrinos = new Map<string, string>();
  for (const r of rows) if (r.pilgrim_id) peregrinos.set(r.pilgrim_id, r.pilgrim_name);
  const matriz = Array.from(peregrinos.entries())
    .sort((a, b) => a[1].localeCompare(b[1], "es"))
    .map(([pilgrimId, nombre]) => {
      const fila: Record<string, any> = { "Peregrino": nombre };
      for (const n of nochesOrdenadas) {
        const hit = rows.find((r) => r.reservation_id === n.id && r.pilgrim_id === pilgrimId);
        fila[n.label] = hit ? roomName(hit) : (noSeHospedan.get(n.id) ?? []).includes(nombre) ? "no duerme" : "";
      }
      return fila;
    });
  appendSheet(wb, "Matriz por peregrino", matriz, "Nadie tiene habitación asignada todavía.");

  return { wb, filename: `habitaciones-${fileSlug(caminoNombre)}-${new Date().toISOString().slice(0, 10)}.xlsx` };
}
