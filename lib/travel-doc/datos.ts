import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROOM_TYPE_LABELS, type RoomType } from "@/lib/data/rooms";

/**
 * De la base al documento de viaje.
 *
 * Todo sale de lo que Naty ya carga para operar el camino: las reservas, los proveedores y
 * las etapas de la ruta. El documento no tiene datos propios salvo la portada y los textos.
 * Eso es la "sola verdad": si se corrige la dirección del Hotel Roma en su ficha, cambia en
 * los documentos de todos los caminos donde aparece.
 *
 * Como en el contrato, acá **no se rellena a ojo**: lo que falta se devuelve como pendiente
 * y la pantalla lo dice. En Camino Sacro un generador se inventó la duración de un viaje
 * cuando a la ruta le faltaban etapas, y salió una oferta prometiendo quince días sobre trece.
 */

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

/** "2027-04-23" → "23.04.2027", que es como lo escribe el documento. */
export function fechaPunteada(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}.${m}.${a}`;
}

/** "2027-04-23" → "23.04". */
export function fechaBreve(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

/** "2027-04-23" → "04.27", la etiqueta de la banda de portada. */
export function etiquetaSalida(iso: string): string {
  const [a, m] = iso.split("-");
  return `${m}.${a.slice(2)}`;
}

/** "2027-04-23" → "23 de abril de 2027". */
export function fechaEnLetra(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

export type FotoHotel = { url: string; caption: string | null };

export type Alojamiento = {
  /** Clave de agrupación: las noches seguidas en el mismo hotel son una sola ficha. */
  clave: string;
  ciudad: string;
  nombre: string;
  noches: number;
  desde: string;
  hasta: string;
  /** "Etapa 3 · 28,8 km", si la ruta lo tiene. En el documento actual hay que ir a buscarlo. */
  etapa: string | null;
  direccion: string | null;
  mapsUrl: string | null;
  checkIn: string | null;
  desayuno: string | null;
  acomodacion: string | null;
  fotos: FotoHotel[];
  /** Cuando el grupo se parte en dos alojamientos la misma noche. */
  compartidoCon: string | null;
};

export type DiaItinerario = {
  fecha: string;
  fechaPunteada: string;
  /** "Encuentro", "Etapa 1", "Cierre", "Despedida". */
  rotulo: string;
  lugar: string;
  alojamiento: string | null;
  km: number | null;
  horas: string | null;
};

export type DocumentoDeViaje = {
  departureId: string;
  camino: string;
  ruta: string;
  km: number | null;
  /** "De Sarria a Santiago de Compostela". */
  recorrido: string | null;
  /** Desde dónde arranca la primera etapa. Es el primer nodo del trazado. */
  origen: string | null;
  etiqueta: string;
  portada: { foto: string | null; subtitulo: string | null; tagline: string; banda: string };
  dias: DiaItinerario[];
  /** Todos los días de la ruta, incluidos los de viaje del equipo. */
  diasCompletos: DiaItinerario[];
  alojamientos: Alojamiento[];
  pendientes: string[];
};

/**
 * Cómo se nombra cada tipo de habitación **en el documento del peregrino**.
 * Las etiquetas de `lib/data/rooms.ts` son para la pantalla de Naty y explican la mecánica
 * ("Grupal (1 habitación todo el grupo)"); acá lo que importa es qué se va a encontrar.
 */
const ACOMODACION_DOC: Partial<Record<RoomType, string>> = {
  individual: "Individual",
  doble: "Doble",
  triple: "Triple",
  cuadruple: "Cuádruple",
  quintuple: "Quíntuple",
  grupal: "Compartida",
};

/** El tipo de acomodación se deduce de las habitaciones reservadas: no se escribe otra vez. */
function acomodacionDesdeHabitaciones(rooms: Array<{ room_type: string }>): string | null {
  const tipos = Array.from(new Set(rooms.map((r) => r.room_type))).filter(Boolean);
  if (!tipos.length) return null;
  const etiquetas = tipos.map((t) => ACOMODACION_DOC[t as RoomType] ?? ROOM_TYPE_LABELS[t as RoomType] ?? t);
  return etiquetas.length === 1
    ? etiquetas[0]
    : `${etiquetas.slice(0, -1).join(", ")} o ${etiquetas[etiquetas.length - 1].toLowerCase()}`;
}

/** Las ciudades vienen con espacios y tildes distintas entre la reserva y el proveedor. */
function normalizarCiudad(...candidatos: Array<string | null | undefined>): string {
  for (const c of candidatos) {
    const v = (c ?? "").trim();
    if (v) return v;
  }
  return "";
}

const DIA_ROTULO: Record<string, string> = {
  pre_camino: "Pre-camino",
  llegada: "Encuentro",
  camino: "Etapa",
  descanso: "Descanso",
  excursion: "Excursión",
  salida: "Cierre",
  post_camino: "Despedida",
};

export async function armarDocumentoDeViaje(
  departureId: string,
  opciones?: { publico?: boolean }
): Promise<DocumentoDeViaje> {
  // La página pública se abre sin sesión, igual que la de firma.
  const db = opciones?.publico ? createAdminClient() : createClient();
  const pendientes: string[] = [];

  const { data: dep, error } = await db
    .from("departures")
    .select("id, name, start_date, route_id, travel_doc, routes:route_id ( name, km, days )")
    .eq("id", departureId)
    .single();
  if (error || !dep) throw new Error(error?.message ?? "No encontré ese camino.");

  const ruta = dep.routes as any;
  const doc = ((dep as any).travel_doc ?? {}) as Record<string, string | null>;

  const { data: etapas } = (dep as any).route_id
    ? await db
        .from("route_stages")
        .select("day_offset, day_kind, from_place, to_place, km, hours_approx, description")
        .eq("route_id", (dep as any).route_id)
        .order("day_offset")
    : { data: [] as any[] };

  const { data: reservas } = await db
    .from("reservations")
    .select(
      `id, day_number, location, check_in, check_out, accommodation_type, check_in_time, breakfast_time,
       providers:provider_id ( id, name, city, address, postal_code, maps_url, check_in_time, breakfast_time ),
       reservation_rooms ( room_type, includes_breakfast )`
    )
    .eq("departure_id", departureId)
    .eq("type", "alojamiento")
    .order("check_in");

  const camas = (reservas ?? []).filter((r: any) => r.check_in);

  // Las fotos de todos los proveedores implicados, en una sola consulta.
  const provIds = Array.from(new Set(camas.map((r: any) => r.providers?.id).filter(Boolean)));
  const { data: fotos } = provIds.length
    ? await db
        .from("provider_photos")
        .select("provider_id, storage_path, caption, position")
        .in("provider_id", provIds)
        .order("position")
    : { data: [] as any[] };

  const urlPublica = (ruta: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/brand/${ruta}`;
  const fotosPorProveedor = new Map<string, FotoHotel[]>();
  for (const f of fotos ?? []) {
    const lista = fotosPorProveedor.get(f.provider_id) ?? [];
    lista.push({ url: urlPublica(f.storage_path), caption: f.caption });
    fotosPorProveedor.set(f.provider_id, lista);
  }

  // ── Noches seguidas en el mismo hotel = una sola ficha ──────────────────────
  // El Araguaney son dos noches y en el documento actual ocupa dos páginas idénticas.
  const porHotel = new Map<string, any[]>();
  for (const r of camas) {
    const k = (r as any).providers?.id ?? `sin-proveedor-${(r as any).id}`;
    porHotel.set(k, [...(porHotel.get(k) ?? []), r]);
  }

  const alojamientos: Alojamiento[] = [];
  for (const [clave, grupo] of Array.from(porHotel.entries())) {
    const r: any = grupo[0];
    const p = r.providers;
    const nombre = p?.name ?? "Sin proveedor asignado";
    const desde = grupo.map((g: any) => g.check_in).sort()[0];
    const hasta = grupo.map((g: any) => g.check_out ?? g.check_in).sort().reverse()[0];
    const etapa = (etapas ?? []).find((e: any) => e.day_offset === r.day_number);
    const habitaciones = grupo.flatMap((g: any) => g.reservation_rooms ?? []);

    // Cuando dos hoteles cubren la misma noche, el grupo se parte y hay que decirlo.
    const misma = camas.filter(
      (o: any) => o.check_in === r.check_in && o.providers?.id && o.providers.id !== p?.id
    );

    if (!p?.address) pendientes.push(`${nombre}: falta la dirección`);
    if (!fotosPorProveedor.get(clave)?.length) pendientes.push(`${nombre}: faltan las fotos`);
    if (!(r.check_in_time ?? p?.check_in_time)) pendientes.push(`${nombre}: falta la hora de entrada`);

    alojamientos.push({
      clave,
      ciudad: normalizarCiudad(p?.city, r.location),
      nombre,
      noches: grupo.length,
      desde,
      hasta,
      etapa:
        etapa && etapa.day_kind === "camino"
          ? `Etapa ${etapa.day_offset}${etapa.km ? ` · ${Number(etapa.km).toLocaleString("es-CO")} km` : ""}`
          : null,
      direccion: [p?.address, p?.postal_code].filter(Boolean).join(", ") || null,
      mapsUrl: p?.maps_url ?? null,
      checkIn: r.check_in_time ?? p?.check_in_time ?? null,
      desayuno: habitaciones.some((h: any) => h.includes_breakfast)
        ? (r.breakfast_time ?? p?.breakfast_time ?? null)
        : null,
      acomodacion: r.accommodation_type ?? acomodacionDesdeHabitaciones(habitaciones),
      fotos: fotosPorProveedor.get(clave) ?? [],
      compartidoCon: misma.length
        ? misma.map((m: any) => m.providers?.name).filter(Boolean).join(" y ")
        : null,
    });
  }
  alojamientos.sort((a, b) => a.desde.localeCompare(b.desde));

  // ── Itinerario general ──────────────────────────────────────────────────────
  const inicio = dep.start_date as string | null;
  const dias: DiaItinerario[] = [];
  if (!inicio) {
    pendientes.push("Falta la fecha de inicio del camino");
  } else if (!etapas?.length) {
    pendientes.push("La ruta no tiene etapas cargadas: sin ellas no puedo armar el itinerario");
  } else {
    for (const e of etapas as any[]) {
      // Convención de la plataforma: day_offset = 1 es el primer día y no existe el 0.
      const f = new Date(`${inicio}T12:00:00Z`);
      f.setUTCDate(f.getUTCDate() + (e.day_offset - 1));
      const iso = f.toISOString().slice(0, 10);
      const cama = alojamientos.find((a) => iso >= a.desde && iso < a.hasta);
      dias.push({
        fecha: iso,
        fechaPunteada: fechaPunteada(iso),
        rotulo: e.day_kind === "camino" ? `Etapa ${e.day_offset}` : (DIA_ROTULO[e.day_kind] ?? e.day_kind),
        lugar: e.to_place || e.from_place || "",
        alojamiento: cama?.nombre ?? null,
        km: e.km ? Number(e.km) : null,
        horas: e.hours_approx ?? null,
      });
    }
  }

  /*
   * El documento es del peregrino, no de la operación. `route_stages` incluye los días de
   * viaje del equipo (Medellín, Madrid ida y vuelta), que al peregrino no le dicen nada y
   * ensucian la tabla. Por defecto se muestra desde el encuentro hasta el día siguiente a
   * la última noche; Naty puede ampliar el rango desde la pantalla.
   */
  const recorte = (() => {
    const desdeManual = Number((doc as any).dias_desde);
    const hastaManual = Number((doc as any).dias_hasta);
    if (Number.isFinite(desdeManual) && Number.isFinite(hastaManual)) {
      return dias.filter((_, i) => i >= desdeManual && i <= hastaManual);
    }
    const primeraNoche = alojamientos[0]?.desde;
    const ultimaNoche = alojamientos[alojamientos.length - 1]?.hasta;
    if (!primeraNoche || !ultimaNoche) return dias;
    return dias.filter((d) => d.fecha >= primeraNoche && d.fecha <= ultimaNoche);
  })();

  const caminadas = (etapas ?? []).filter((e: any) => e.day_kind === "camino");
  const desdeLugar = caminadas[0]?.from_place ?? null;
  const hastaLugar = caminadas[caminadas.length - 1]?.to_place ?? null;

  return {
    departureId,
    camino: dep.name as string,
    ruta: ruta?.name ?? "",
    km: ruta?.km ? Number(ruta.km) : null,
    recorrido: desdeLugar && hastaLugar ? `De ${desdeLugar} a ${hastaLugar}` : null,
    origen: desdeLugar,
    etiqueta: inicio ? etiquetaSalida(inicio) : "",
    portada: {
      foto: doc.cover_photo ?? null,
      subtitulo: doc.subtitulo ?? null,
      tagline: doc.tagline ?? "El verdadero territorio que caminas eres tú",
      banda: doc.banda ?? "Itinerario y reservas",
    },
    dias: recorte,
    /** Todos los días de la ruta, para que la pantalla pueda ofrecer ampliar el rango. */
    diasCompletos: dias,
    alojamientos,
    pendientes,
  };
}
