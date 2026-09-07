import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { appendSheet, xlsxResponse, fileSlug } from "@/lib/export";
import { ROOM_TYPE_LABELS, type RoomType } from "@/lib/data/rooms";

export const dynamic = "force-dynamic";

type Row = any;

function roomLabel(t: string) {
  return ROOM_TYPE_LABELS[t as RoomType] ?? t;
}

/** "Doble 2" — el nombre con el que Naty le habla al hotel. */
function roomName(r: Row) {
  return `${roomLabel(r.room_type)} ${r.room_index}`;
}

/** Etiqueta corta de una noche, para encabezar columnas de la matriz. */
function nightLabel(r: Row) {
  const fecha = r.check_in ? String(r.check_in).slice(5) : "";
  return [r.day_number != null ? `D${r.day_number}` : null, fecha, r.provider_name]
    .filter(Boolean)
    .join(" · ");
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: departure }, { data: rooming }] = await Promise.all([
    supabase.from("departures").select("id, name, start_date, end_date").eq("id", params.id).maybeSingle(),
    supabase.from("v_rooming_list").select("*").eq("departure_id", params.id),
  ]);

  if (!departure) return NextResponse.json({ error: "Camino no encontrado" }, { status: 404 });

  const rows = (rooming ?? []) as Row[];

  // Orden estable: por fecha, luego por el orden en que se capturaron las
  // habitaciones, luego por número de habitación y por nombre de quien la ocupa.
  rows.sort(
    (a, b) =>
      String(a.check_in ?? "9999").localeCompare(String(b.check_in ?? "9999")) ||
      (a.provider_name ?? "").localeCompare(b.provider_name ?? "", "es") ||
      (a.room_position ?? 0) - (b.room_position ?? 0) ||
      a.room_index - b.room_index ||
      (a.pilgrim_name ?? "").localeCompare(b.pilgrim_name ?? "", "es")
  );

  // ── Hoja 1: distribución, una fila por persona (o por cama libre) ──────────
  const distribucion = rows.map((r) => ({
    "Día": r.day_number ?? "",
    "Check-in": r.check_in ?? "",
    "Check-out": r.check_out ?? "",
    "Hospedaje": r.provider_name ?? "",
    "Ciudad": r.location ?? r.provider_city ?? "",
    "Habitación": roomName(r),
    "Capacidad": r.capacity_per_room ?? "",
    "Peregrino": r.pilgrim_name ?? "— libre —",
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

  // ── Hoja 2: resumen por hospedaje, una fila por habitación física ─────────
  const porHabitacion = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.reservation_room_id}:${r.room_index}`;
    porHabitacion.set(key, [...(porHabitacion.get(key) ?? []), r]);
  }

  const porHospedaje = Array.from(porHabitacion.values()).map((group) => {
    const r = group[0];
    const ocupantes = group.filter((x) => x.pilgrim_id).map((x) => x.pilgrim_name);
    return {
      "Día": r.day_number ?? "",
      "Check-in": r.check_in ?? "",
      "Check-out": r.check_out ?? "",
      "Hospedaje": r.provider_name ?? "",
      "Ciudad": r.location ?? r.provider_city ?? "",
      "Dirección": r.provider_address ?? "",
      "Teléfono hotel": r.provider_phone ?? "",
      "Email hotel": r.provider_email ?? "",
      "Habitación": roomName(r),
      "Capacidad": r.capacity_per_room ?? 0,
      "Ocupada por": ocupantes.length,
      "Camas libres": Math.max((r.capacity_per_room ?? 0) - ocupantes.length, 0),
      "Ocupantes": ocupantes.join(", "),
      "Desayuno": r.includes_breakfast ? "Sí" : "No",
      "Cena": r.includes_dinner ? "Sí" : "No",
      "Estado reserva": r.reservation_status ?? "",
      "Reserva": r.confirmation_ref ?? "",
      "Notas": r.room_notes ?? "",
    };
  });

  // ── Hoja 3: totales por noche, lo que se le confirma a cada hotel ─────────
  const porNoche = new Map<string, Row[]>();
  for (const r of rows) {
    porNoche.set(r.reservation_id, [...(porNoche.get(r.reservation_id) ?? []), r]);
  }

  const noches = Array.from(porNoche.values()).map((group) => {
    const r = group[0];
    const habitaciones = new Set(group.map((x) => `${x.reservation_room_id}:${x.room_index}`));
    const conGente = new Set(
      group.filter((x) => x.pilgrim_id).map((x) => `${x.reservation_room_id}:${x.room_index}`)
    );
    const plazas = Array.from(habitaciones).reduce((s, key) => {
      const first = group.find((x) => `${x.reservation_room_id}:${x.room_index}` === key);
      return s + Number(first?.capacity_per_room ?? 0);
    }, 0);
    const personas = new Set(group.filter((x) => x.pilgrim_id).map((x) => x.pilgrim_id)).size;

    // Desglose "3 dobles + 1 triple", contando solo las habitaciones con gente
    const tipos = new Map<string, number>();
    for (const key of Array.from(conGente)) {
      const first = group.find((x) => `${x.reservation_room_id}:${x.room_index}` === key);
      const t = roomLabel(first?.room_type ?? "otro");
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
      "Habitaciones en uso": conGente.size,
      "Desglose en uso": Array.from(tipos.entries()).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(" + "),
      "Plazas": plazas,
      "Personas asignadas": personas,
      "Plazas libres": Math.max(plazas - personas, 0),
      "Estado": r.reservation_status ?? "",
      "Reserva": r.confirmation_ref ?? "",
      "Notas": r.reservation_notes ?? "",
    };
  });

  // ── Hoja 4: matriz peregrino × noche, para ver rotaciones de un vistazo ───
  // Dos reservas pueden caer el mismo día en el mismo hotel; las columnas de una
  // hoja de Excel no pueden repetir nombre, así que se desempatan con un sufijo.
  const usados = new Map<string, number>();
  const nochesOrdenadas = Array.from(porNoche.values()).map((g) => {
    const base = nightLabel(g[0]);
    const n = (usados.get(base) ?? 0) + 1;
    usados.set(base, n);
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
        fila[n.label] = hit ? roomName(hit) : "";
      }
      return fila;
    });

  const wb = XLSX.utils.book_new();
  appendSheet(wb, "Distribución", distribucion, "Este camino no tiene habitaciones cargadas.");
  appendSheet(wb, "Por hospedaje", porHospedaje);
  appendSheet(wb, "Resumen por noche", noches);
  appendSheet(wb, "Matriz por peregrino", matriz, "Nadie tiene habitación asignada todavía.");

  const filename = `habitaciones-${fileSlug((departure as any).name)}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return xlsxResponse(wb, filename);
}
