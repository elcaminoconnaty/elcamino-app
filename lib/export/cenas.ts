import "server-only";
import { fileSlug } from "@/lib/export";
import { ExcelJS, hojaDeDatos, libroABuffer, nombreDeHoja } from "@/lib/export/bonito";
import { hojaDeRestaurante, filasNominales } from "@/lib/export/cenas-hoja";
import { COURSE_LABELS, type CourseKind } from "@/lib/data/menus";

/**
 * Las cenas de un camino con lo que eligió cada uno: lo usan el Excel (una pestaña por
 * restaurante) y el correo al restaurante (cantidades por plato). Vive acá y no en el
 * route handler porque lo comparten.
 */

type Row = any;

export type Curso = {
  id: string;
  label: string;
  required: boolean;
  mode: "peregrino" | "fijo" | "en_sitio";
  depends: string | null;
  /** El plato de una sección fija (o el primero, si es de elegir). */
  fixed: string | null;
};

export type Cena = {
  reservation_id: string;
  info: Row;
  /** Secciones en orden, con su rótulo. */
  courses: Curso[];
  /** filas de v_menu_choices agrupadas por peregrino */
  porPeregrino: Map<string, Row[]>;
  noCenan: string[];
};

export type DatosCenas = { caminoNombre: string; cenas: Cena[] };

function courseLabel(r: Row) {
  return r.course_label && r.course_label !== r.course ? r.course_label : (COURSE_LABELS[r.course as CourseKind] ?? r.course);
}

/** Etiqueta corta de una cena, para encabezar columnas de la matriz. */
function dinnerLabel(d: Row) {
  const fecha = d.check_in ? String(d.check_in).slice(5) : "";
  return [d.day_number != null ? `D${d.day_number}` : null, fecha, d.provider_name].filter(Boolean).join(" · ");
}

/** Una sección condicional aplica si el peregrino tiene elegida la opción de la que depende. */
export function aplica(c: { depends: string | null }, filas: Row[]): boolean {
  return !c.depends || filas.some((f) => f.option_id === c.depends);
}

/** Si un peregrino ya eligió todo lo que le toca. Con un menú sin nada que elegir, todos están listos. */
export function completo(filas: Row[], courses: Curso[]): boolean {
  const eligibles = courses.filter((c) => c.mode === "peregrino");
  if (courses.length === 0) return false;
  if (eligibles.length === 0) return true;
  const porCurso = new Map(filas.map((f) => [f.course_id, f]));
  const obligatorias = eligibles.filter((c) => c.required && aplica(c, filas));
  return obligatorias.length > 0 && obligatorias.every((c) => porCurso.get(c.id)?.option_id);
}

/** Cuántos cenan, cuántos eligieron y cuántos faltan. */
export function progresoDe(cena: Cena) {
  const personas = cena.porPeregrino.size;
  const cenan = personas - cena.noCenan.length;
  const eligieron = Array.from(cena.porPeregrino.entries()).filter(([id, filas]) => !cena.noCenan.includes(id) && completo(filas, cena.courses)).length;
  return { personas, cenan, eligieron, pendientes: cena.courses.length > 0 ? Math.max(cenan - eligieron, 0) : 0 };
}

export type ConteoSeccion = { seccion: string; platos: { plato: string; n: number; todos: boolean }[]; total: number };

/**
 * Lo que el restaurante quiere saber: por sección, cuántos de cada plato. Las secciones
 * fijas van con el total de comensales; las "en el restaurante" no se mandan.
 */
export function conteoPorSeccion(cena: Cena): ConteoSeccion[] {
  const { cenan } = progresoDe(cena);
  const out: ConteoSeccion[] = [];
  for (const c of cena.courses) {
    if (c.mode === "en_sitio") continue;
    if (c.mode === "fijo") {
      if (c.fixed && cenan > 0) out.push({ seccion: c.label, platos: [{ plato: c.fixed, n: cenan, todos: true }], total: cenan });
      continue;
    }
    const conteo = new Map<string, number>();
    for (const [id, filas] of Array.from(cena.porPeregrino.entries())) {
      if (cena.noCenan.includes(id)) continue;
      if (!aplica(c, filas)) continue;
      const f = filas.find((x) => x.course_id === c.id);
      if (!f?.option_id) continue;
      conteo.set(f.option_name, (conteo.get(f.option_name) ?? 0) + 1);
    }
    const platos = Array.from(conteo.entries()).map(([plato, n]) => ({ plato, n, todos: false })).sort((a, b) => b.n - a.n || a.plato.localeCompare(b.plato, "es"));
    if (platos.length > 0) out.push({ seccion: c.label, platos, total: platos.reduce((s, p) => s + p.n, 0) });
  }
  return out;
}

/** Restricciones alimentarias de quienes cenan: [nombre, nota]. */
export function dietasDe(cena: Cena): [string, string][] {
  return Array.from(cena.porPeregrino.entries())
    .filter(([id, filas]) => !cena.noCenan.includes(id) && filas[0].dietary_notes)
    .map(([, filas]) => [filas[0].pilgrim_name, filas[0].dietary_notes] as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0], "es"));
}

/** Carga las cenas del camino con las elecciones. `null` si el camino no existe. */
export async function cargarCenas(supabase: any, departureId: string): Promise<DatosCenas | null> {
  const [{ data: departure }, { data: choices }, { data: cenasTodas }] = await Promise.all([
    supabase.from("departures").select("id, name").eq("id", departureId).maybeSingle(),
    supabase.from("v_menu_choices").select("*").eq("departure_id", departureId),
    // Las cenas sin menú no aparecen en v_menu_choices; se piden aparte para que no
    // desaparezcan del Resumen.
    supabase.from("v_dinner_reservations").select("*").eq("departure_id", departureId),
  ]);
  if (!departure) return null;
  const caminoNombre = (departure as any).name as string;

  const reservaIds = (cenasTodas ?? []).map((c: any) => c.reservation_id);
  const { data: optOuts } = reservaIds.length
    ? await supabase.from("reservation_opt_outs").select("reservation_id, pilgrim_id, pilgrims(full_name)").in("reservation_id", reservaIds).eq("kind", "cena")
    : { data: [] as any[] };
  const noCenanPor = new Map<string, { id: string; nombre: string }[]>();
  for (const o of (optOuts ?? []) as any[]) {
    noCenanPor.set(o.reservation_id, [...(noCenanPor.get(o.reservation_id) ?? []), { id: o.pilgrim_id, nombre: o.pilgrims?.full_name ?? "" }]);
  }

  const infos = ((cenasTodas ?? []) as Row[]).sort(
    (a, b) => String(a.check_in ?? "9999").localeCompare(String(b.check_in ?? "9999")) || (a.provider_name ?? "").localeCompare(b.provider_name ?? "", "es")
  );
  const filasPor = new Map<string, Row[]>();
  for (const r of (choices ?? []) as Row[]) filasPor.set(r.reservation_id, [...(filasPor.get(r.reservation_id) ?? []), r]);

  const cenas: Cena[] = infos.map((info) => {
    const filas = (filasPor.get(info.reservation_id) ?? []).sort((a, b) => a.course_position - b.course_position);
    const courses: Curso[] = Array.from(
      new Map(
        filas.map((f) => [
          f.course_id,
          { id: f.course_id, label: courseLabel(f), required: !!f.required, mode: (f.mode ?? "peregrino") as Curso["mode"], depends: f.depends_on_option_id ?? null, fixed: f.first_option_name ?? null },
        ])
      ).values()
    );
    const porPeregrino = new Map<string, Row[]>();
    for (const f of filas) porPeregrino.set(f.pilgrim_id, [...(porPeregrino.get(f.pilgrim_id) ?? []), f]);
    const noCenan = (noCenanPor.get(info.reservation_id) ?? []).map((x) => x.id);
    // Quienes no cenan pero no están en la vista (cena sin menú) igual tienen que contarse.
    for (const x of noCenanPor.get(info.reservation_id) ?? []) {
      if (!porPeregrino.has(x.id)) porPeregrino.set(x.id, [{ pilgrim_id: x.id, pilgrim_name: x.nombre, required: false }]);
    }
    return { reservation_id: info.reservation_id, info, courses, porPeregrino, noCenan };
  });
  return { caminoNombre, cenas };
}

/** Las cenas de un restaurante (por proveedor) o una sola reserva. */
export function cenasDe(datos: DatosCenas, filtro: { providerId?: string | null; reservationId?: string | null }): Cena[] {
  return datos.cenas.filter((c) => (!filtro.providerId || c.info.provider_id === filtro.providerId) && (!filtro.reservationId || c.reservation_id === filtro.reservationId));
}

/** El libro de un solo restaurante: la plantilla para la cocina y el detalle nominal. */
export async function libroDeRestaurante(datos: DatosCenas, grupo: Cena[]): Promise<{ filename: string; buffer: Buffer } | null> {
  if (grupo.length === 0) return null;
  const wb = new ExcelJS.Workbook();
  hojaDeRestaurante(wb, grupo, datos.caminoNombre);
  hojaDeDatos(wb, "Detalle por peregrino", filasNominales(grupo), "Nadie ha elegido menú todavía.");
  return {
    filename: `menu-${fileSlug(grupo[0].info.provider_name ?? "restaurante")}-${fileSlug(datos.caminoNombre)}.xlsx`,
    buffer: await libroABuffer(wb),
  };
}

/** El libro completo del camino: resumen, una pestaña por restaurante y la matriz por peregrino. */
export async function libroCompletoCenas(datos: DatosCenas): Promise<{ filename: string; buffer: Buffer }> {
  const { caminoNombre, cenas } = datos;
  const wb = new ExcelJS.Workbook();

  const porRestaurante = new Map<string, Cena[]>();
  for (const c of cenas) {
    const key = c.info.provider_id ?? c.info.provider_name ?? "sin-restaurante";
    porRestaurante.set(key, [...(porRestaurante.get(key) ?? []), c]);
  }

  const resumen = cenas.map((c) => {
    const { personas, eligieron, pendientes } = progresoDe(c);
    return {
      "Día": c.info.day_number ?? "",
      "Fecha": c.info.check_in ?? "",
      "Restaurante": c.info.provider_name ?? "",
      "Ciudad": c.info.location ?? c.info.provider_city ?? "",
      "Teléfono": c.info.provider_phone ?? "",
      "Email": c.info.provider_email ?? "",
      "Cena del hotel": c.info.via_meal_kind ? "" : c.info.via_rooms ? "Sí" : "",
      "Menú cargado": c.courses.length > 0 ? "Sí" : "No",
      "Secciones": c.courses.map((x) => (x.mode === "fijo" ? `${x.label}: ${x.fixed ?? "—"} (todos)` : x.mode === "en_sitio" ? `${x.label} (en el restaurante)` : x.label)).join(" · "),
      "Nota a los peregrinos": c.info.menu_notes_pilgrim ?? "",
      "Inscritos": personas,
      "No cenan": c.noCenan.length,
      "Eligieron": eligieron,
      "Pendientes": c.courses.length > 0 ? pendientes : "",
      "Personas reservadas": c.info.meal_persons ?? "",
      "Estado": c.info.reservation_status ?? "",
      "Reserva": c.info.confirmation_ref ?? "",
      "Notas": c.info.reservation_notes ?? "",
    };
  });
  hojaDeDatos(wb, "Resumen", resumen, "Este camino no tiene cenas cargadas.");

  const usadas = new Map<string, number>();
  for (const grupo of Array.from(porRestaurante.values())) {
    const base = nombreDeHoja(grupo[0].info.provider_name ?? "Restaurante");
    const n = (usadas.get(base) ?? 0) + 1;
    usadas.set(base, n);
    hojaDeRestaurante(wb, grupo, caminoNombre, n > 1 ? nombreDeHoja(`${base} ${n}`) : base);
  }

  // La lista nominal de todas las cenas, que ya no cabe en la hoja de cada restaurante.
  hojaDeDatos(wb, "Detalle por peregrino", filasNominales(cenas), "Nadie ha elegido menú todavía.");

  const usadosLabel = new Map<string, number>();
  const cenasOrdenadas = cenas.map((c) => {
    const base = dinnerLabel(c.info);
    const n = (usadosLabel.get(base) ?? 0) + 1;
    usadosLabel.set(base, n);
    return { cena: c, label: n === 1 ? base : `${base} (${n})` };
  });
  const peregrinos = new Map<string, string>();
  for (const c of cenas) for (const [id, filas] of Array.from(c.porPeregrino.entries())) if (filas[0]?.pilgrim_name) peregrinos.set(id, filas[0].pilgrim_name);
  const matriz = Array.from(peregrinos.entries())
    .sort((a, b) => a[1].localeCompare(b[1], "es"))
    .map(([id, nombre]) => {
      const fila: Record<string, any> = { "Peregrino": nombre };
      for (const { cena, label } of cenasOrdenadas) {
        if (cena.noCenan.includes(id)) {
          fila[label] = "no cena";
          continue;
        }
        const filas = cena.porPeregrino.get(id) ?? [];
        const cursoDe = new Map(cena.courses.map((c) => [c.id, c]));
        const platos = filas
          .filter((f) => f.option_id && f.mode === "peregrino" && aplica(cursoDe.get(f.course_id) ?? { depends: null }, filas))
          .map((f) => f.option_name);
        const hayQueElegir = cena.courses.some((c) => c.mode === "peregrino");
        fila[label] = cena.courses.length === 0 ? "" : !hayQueElegir ? "menú fijo" : platos.length === 0 ? "pendiente" : platos.join(" / ");
      }
      return fila;
    });
  hojaDeDatos(wb, "Matriz por peregrino", matriz, "Nadie ha elegido menú todavía.");

  return { filename: `cenas-${fileSlug(caminoNombre)}-${new Date().toISOString().slice(0, 10)}.xlsx`, buffer: await libroABuffer(wb) };
}
