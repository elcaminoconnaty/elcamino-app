"use server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { pilgrimsOf, type PilgrimOf } from "@/lib/data/pilgrims-of";
import {
  menuFromRows,
  validateChoices,
  type MenuCourse,
  type MenuInput,
  type ChoiceInput,
} from "@/lib/data/menus";
import type { MealChoice } from "@/types/db";

export type { MenuInput, ChoiceInput };

export type Dinner = {
  id: string;
  day_number: number | null;
  check_in: string | null;
  location: string | null;
  status: string | null;
  confirmation_ref: string | null;
  meal_persons: number | null;
  provider_id: string;
  provider_name: string;
  provider_city: string | null;
  /** La cena viene de una habitación con cena incluida (hotel), no de una reserva de restaurante. */
  via_rooms: boolean;
  /** Lo que ve el peregrino arriba del menú ("bebidas incluidas: agua y vino"). */
  menu_notes_pilgrim: string | null;
  provider_contact_name: string | null;
  courses: MenuCourse[];
  choices: MealChoice[];
  /** Quiénes no cenan esa noche. */
  optOuts: string[];
};

export type DinnerInput = {
  reservationId: string;
  choices: ChoiceInput[];
  optOuts: string[];
};

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function revalidar(departureId?: string | null) {
  if (!departureId) return;
  revalidatePath(`/caminos/${departureId}`);
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Secciones y platos de un conjunto de reservas, ya anidados. */
async function menusDe(supabase: any, reservationIds: string[]): Promise<Map<string, MenuCourse[]>> {
  const out = new Map<string, MenuCourse[]>();
  if (reservationIds.length === 0) return out;
  const { data: courses } = await supabase
    .from("reservation_menu_courses")
    .select("id, reservation_id, course, label, position, required, mode, depends_on_option_id")
    .in("reservation_id", reservationIds);
  const courseIds = (courses ?? []).map((c: any) => c.id);
  const { data: options } = courseIds.length
    ? await supabase.from("reservation_menu_options").select("id, course_id, name, description, position").in("course_id", courseIds)
    : { data: [] };
  const porReserva = new Map<string, any[]>();
  for (const c of courses ?? []) porReserva.set(c.reservation_id, [...(porReserva.get(c.reservation_id) ?? []), c]);
  for (const id of reservationIds) out.set(id, menuFromRows(porReserva.get(id) ?? [], options ?? []));
  return out;
}

/** Todo lo que la pestaña de cenas necesita para el camino entero. */
export async function getMenusBoard(departureId: string): Promise<{ dinners: Dinner[]; pilgrims: PilgrimOf[] }> {
  const supabase = createClient();
  const [{ data: reservas }, pilgrims] = await Promise.all([
    supabase
      .from("v_dinner_reservations")
      .select("*")
      .eq("departure_id", departureId)
      .order("check_in", { ascending: true, nullsFirst: false })
      .order("day_number", { ascending: true }),
    pilgrimsOf(supabase, departureId),
  ]);
  const ids = (reservas ?? []).map((r: any) => r.reservation_id);
  if (ids.length === 0) return { dinners: [], pilgrims };

  const [menus, { data: choices }, { data: optOuts }] = await Promise.all([
    menusDe(supabase, ids),
    supabase.from("meal_choices").select("*").in("reservation_id", ids),
    supabase.from("reservation_opt_outs").select("reservation_id, pilgrim_id").in("reservation_id", ids).eq("kind", "cena"),
  ]);
  const chBy = new Map<string, MealChoice[]>();
  for (const c of (choices ?? []) as MealChoice[]) chBy.set(c.reservation_id, [...(chBy.get(c.reservation_id) ?? []), c]);
  const optBy = new Map<string, string[]>();
  for (const o of optOuts ?? []) optBy.set(o.reservation_id, [...(optBy.get(o.reservation_id) ?? []), o.pilgrim_id]);

  const dinners: Dinner[] = (reservas ?? []).map((r: any) => ({
    id: r.reservation_id,
    day_number: r.day_number,
    check_in: r.check_in,
    location: r.location,
    status: r.reservation_status,
    confirmation_ref: r.confirmation_ref,
    meal_persons: r.meal_persons,
    provider_id: r.provider_id,
    provider_name: r.provider_name ?? "—",
    provider_city: r.provider_city ?? null,
    via_rooms: !r.via_meal_kind && !!r.via_rooms,
    menu_notes_pilgrim: r.menu_notes_pilgrim ?? null,
    provider_contact_name: r.provider_contact_name ?? null,
    courses: menus.get(r.reservation_id) ?? [],
    choices: chBy.get(r.reservation_id) ?? [],
    optOuts: optBy.get(r.reservation_id) ?? [],
  }));
  return { dinners, pilgrims };
}

/**
 * Guarda el menú de una cena. Empareja secciones y platos **por id**: lo que trae id se
 * actualiza, lo nuevo se crea, lo que falta se borra. Borrar un plato borra en cascada
 * las elecciones que lo tenían, así que la pantalla avisa antes.
 *
 * Va en dos pasadas: primero secciones y platos (sin dependencias, para que ninguna
 * apunte a un plato que todavía no existe o a una posición vieja), después las
 * dependencias por índice. Una sección "fija" se queda con un solo plato y una
 * "en el restaurante" con ninguno.
 */
export async function setReservationMenu(reservationId: string, menu: MenuInput, departureId: string): Promise<Resultado> {
  const supabase = createClient();
  const { data: existentes } = await supabase.from("reservation_menu_courses").select("id").eq("reservation_id", reservationId);
  const cursosPrevios = new Set((existentes ?? []).map((c: any) => c.id));
  const cursosVistos = new Set<string>();
  /** idsPorIndice[sección][plato] = id en la base (null si el plato venía vacío y se saltó). */
  const idsPorIndice: (string | null)[][] = [];
  const idsCurso: string[] = [];

  for (let i = 0; i < menu.length; i++) {
    const c = menu[i];
    const mode = c.mode ?? "peregrino";
    const fila = {
      reservation_id: reservationId,
      course: c.course,
      label: c.label?.trim() || null,
      position: i,
      required: mode === "peregrino" ? c.required !== false : false,
      mode,
      depends_on_option_id: null as string | null,
    };
    let courseId = c.id && cursosPrevios.has(c.id) ? c.id : null;
    if (courseId) {
      const { error } = await supabase.from("reservation_menu_courses").update({ ...fila, updated_at: new Date().toISOString() }).eq("id", courseId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { data, error } = await supabase.from("reservation_menu_courses").insert(fila).select("id").single();
      if (error) return { ok: false, error: error.message };
      courseId = data.id as string;
    }
    cursosVistos.add(courseId);
    idsCurso[i] = courseId;
    idsPorIndice[i] = [];

    const { data: opsPrevias } = await supabase.from("reservation_menu_options").select("id").eq("course_id", courseId);
    const previas = new Set((opsPrevias ?? []).map((o: any) => o.id));
    const vistas = new Set<string>();
    const opciones = mode === "en_sitio" ? [] : mode === "fijo" ? c.options.filter((o) => o.name.trim()).slice(0, 1) : c.options;
    for (let j = 0; j < opciones.length; j++) {
      const o = opciones[j];
      const name = o.name.trim();
      if (!name) {
        idsPorIndice[i][j] = null;
        continue;
      }
      const filaOp = { course_id: courseId, name, description: o.description?.trim() || null, position: j };
      if (o.id && previas.has(o.id)) {
        const { error } = await supabase.from("reservation_menu_options").update(filaOp).eq("id", o.id);
        if (error) return { ok: false, error: error.message };
        vistas.add(o.id);
        idsPorIndice[i][j] = o.id;
      } else {
        const { data, error } = await supabase.from("reservation_menu_options").insert(filaOp).select("id").single();
        if (error) return { ok: false, error: error.message };
        vistas.add(data.id);
        idsPorIndice[i][j] = data.id;
      }
    }
    const sobrantesOp = Array.from(previas).filter((id) => !vistas.has(id));
    if (sobrantesOp.length > 0) {
      const { error } = await supabase.from("reservation_menu_options").delete().in("id", sobrantesOp);
      if (error) return { ok: false, error: error.message };
    }
  }

  const sobrantes = Array.from(cursosPrevios).filter((id) => !cursosVistos.has(id));
  if (sobrantes.length > 0) {
    const { error } = await supabase.from("reservation_menu_courses").delete().in("id", sobrantes);
    if (error) return { ok: false, error: error.message };
  }

  // Segunda pasada: dependencias. El trigger de la base valida que el padre vaya antes y
  // sea una sección que elige el peregrino; su mensaje sube tal cual a la pantalla.
  for (let i = 0; i < menu.length; i++) {
    const dep = menu[i].depends_on;
    if (!dep) continue;
    const optionId = idsPorIndice[dep.course_index]?.[dep.option_index] ?? null;
    if (!optionId) return { ok: false, error: `"${menu[i].label || menu[i].course}" depende de un plato que quedó vacío.` };
    const { error } = await supabase.from("reservation_menu_courses").update({ depends_on_option_id: optionId }).eq("id", idsCurso[i]);
    if (error) return { ok: false, error: error.message };
  }

  // Las elecciones de secciones condicionales que dejaron de aplicar se limpian acá
  // mismo, para que el tablero no muestre platos fantasma.
  await supabase.rpc("prune_dependent_choices", { p_reservation_id: reservationId, p_pilgrim_id: null });
  revalidar(departureId);
  return { ok: true };
}

/** La nota que ve el peregrino arriba del menú de esa cena. */
export async function setMenuNotes(reservationId: string, texto: string, departureId: string): Promise<Resultado> {
  const supabase = createClient();
  const { error } = await supabase.from("reservations").update({ menu_notes_pilgrim: texto.trim() || null }).eq("id", reservationId);
  if (error) return { ok: false, error: error.message };
  revalidar(departureId);
  return { ok: true };
}

/** Prender o apagar "pedir menú a los peregrinos" en una reserva. */
export async function setMenuRequired(reservationId: string, value: boolean, departureId: string): Promise<Resultado> {
  const supabase = createClient();
  const { error } = await supabase.from("reservations").update({ menu_required: value }).eq("id", reservationId);
  if (error) return { ok: false, error: error.message };
  revalidar(departureId);
  return { ok: true };
}

export type MenuAnterior = { reservationId: string; etiqueta: string; courses: MenuCourse[] };

/** El menú más reciente que se cargó para este restaurante en cualquier camino, para copiarlo. */
export async function ultimoMenuDelRestaurante(providerId: string, excludeReservationId: string): Promise<MenuAnterior | null> {
  const supabase = createClient();
  const { data: cursos } = await supabase
    .from("reservation_menu_courses")
    .select("reservation_id, reservations!inner(id, provider_id, check_in, departures(name))")
    .eq("reservations.provider_id", providerId)
    .neq("reservation_id", excludeReservationId);
  const candidatas = new Map<string, any>();
  for (const c of (cursos ?? []) as any[]) candidatas.set(c.reservation_id, c.reservations);
  if (candidatas.size === 0) return null;
  const [reservationId, r] = Array.from(candidatas.entries()).sort((a, b) => String(b[1].check_in ?? "").localeCompare(String(a[1].check_in ?? "")))[0];
  const menus = await menusDe(supabase, [reservationId]);
  const courses = menus.get(reservationId) ?? [];
  if (courses.length === 0) return null;
  return {
    reservationId,
    etiqueta: [r.departures?.name, r.check_in ? formatDate(r.check_in) : null].filter(Boolean).join(" · "),
    courses,
  };
}

/**
 * Guarda las elecciones y los "no cena" de las cenas que cambiaron, en una sola
 * transacción (`save_meal_choices`). Devuelve el problema como dato, con restaurante y
 * fecha, porque en producción el mensaje de un `throw` se pierde.
 */
export async function saveMenusBoard(departureId: string, dinners: DinnerInput[]): Promise<Resultado<{ cenas: number }>> {
  const supabase = createClient();
  if (dinners.length === 0) return { ok: true, cenas: 0 };
  const ids = dinners.map((d) => d.reservationId);
  const [menus, { data: reservas }] = await Promise.all([
    menusDe(supabase, ids),
    supabase.from("reservations").select("id, check_in, providers(name)").in("id", ids),
  ]);
  const nombreDe = new Map<string, string>();
  for (const r of (reservas ?? []) as any[]) {
    nombreDe.set(r.id, [r.providers?.name, r.check_in ? formatDate(r.check_in) : null].filter(Boolean).join(" · "));
  }
  for (const d of dinners) {
    const problema = validateChoices(d.choices, menus.get(d.reservationId) ?? [], d.optOuts);
    if (problema) return { ok: false, error: `${nombreDe.get(d.reservationId) ?? "Una cena"}: ${problema}` };
  }

  const { error } = await supabase.rpc("save_meal_choices", {
    p_departure_id: departureId,
    p_dinners: dinners.map((d) => ({
      reservation_id: d.reservationId,
      choices: d.choices.map((c) => ({ pilgrim_id: c.pilgrim_id, course_id: c.course_id, option_id: c.option_id, notes: c.notes ?? null })),
      opt_outs: d.optOuts.map((pilgrim_id) => ({ pilgrim_id })),
    })),
  });
  if (error) return { ok: false, error: error.message };
  revalidar(departureId);
  return { ok: true, cenas: dinners.length };
}

/** El enlace personal de una inscripción; se genera la primera vez que se pide. */
export async function obtenerEnlaceMenu(registrationId: string): Promise<Resultado<{ url: string }>> {
  const supabase = createClient();
  const { data: reg, error } = await supabase.from("registrations").select("id, menu_token, status").eq("id", registrationId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!reg) return { ok: false, error: "No encontré la inscripción." };
  if (reg.status === "cancelado") return { ok: false, error: "La inscripción está cancelada." };
  let token = reg.menu_token as string | null;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    const { error: e2 } = await supabase
      .from("registrations")
      .update({ menu_token: token, menu_token_created_at: new Date().toISOString() })
      .eq("id", registrationId);
    if (e2) return { ok: false, error: e2.message };
  }
  return { ok: true, url: `${baseUrl()}/menu/${token}` };
}

/** Cambia el enlace: el anterior deja de servir. */
export async function rotarEnlaceMenu(registrationId: string, departureId?: string): Promise<Resultado<{ url: string }>> {
  const supabase = createClient();
  const token = crypto.randomBytes(32).toString("hex");
  const { error } = await supabase
    .from("registrations")
    .update({ menu_token: token, menu_token_created_at: new Date().toISOString() })
    .eq("id", registrationId);
  if (error) return { ok: false, error: error.message };
  revalidar(departureId);
  return { ok: true, url: `${baseUrl()}/menu/${token}` };
}

/** El enlace único del camino (la lista de nombres); se genera la primera vez que se pide. */
export async function obtenerEnlaceMenuCamino(departureId: string): Promise<Resultado<{ url: string }>> {
  const supabase = createClient();
  const { data: d, error } = await supabase.from("departures").select("id, menu_token").eq("id", departureId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!d) return { ok: false, error: "No encontré el camino." };
  let token = d.menu_token as string | null;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    const { error: e2 } = await supabase
      .from("departures")
      .update({ menu_token: token, menu_token_created_at: new Date().toISOString() })
      .eq("id", departureId);
    if (e2) return { ok: false, error: e2.message };
  }
  return { ok: true, url: `${baseUrl()}/menu/c/${token}` };
}

/** Cambia el enlace del camino: el anterior deja de servir (y los personales siguen igual). */
export async function rotarEnlaceMenuCamino(departureId: string): Promise<Resultado<{ url: string }>> {
  const supabase = createClient();
  const token = crypto.randomBytes(32).toString("hex");
  const { error } = await supabase
    .from("departures")
    .update({ menu_token: token, menu_token_created_at: new Date().toISOString() })
    .eq("id", departureId);
  if (error) return { ok: false, error: error.message };
  revalidar(departureId);
  return { ok: true, url: `${baseUrl()}/menu/c/${token}` };
}

/** Un enlace por inscrito, listo para pegar en WhatsApp. Genera los que falten. */
export async function enlacesMenuDelCamino(departureId: string): Promise<Resultado<{ texto: string; total: number }>> {
  const supabase = createClient();
  const gente = await pilgrimsOf(supabase, departureId);
  const lineas: string[] = [];
  for (const p of gente) {
    const r = await obtenerEnlaceMenu(p.registration_id);
    if (!r.ok) return r;
    lineas.push(`${p.full_name}: ${r.url}`);
  }
  revalidar(departureId);
  return { ok: true, texto: lineas.join("\n"), total: lineas.length };
}
