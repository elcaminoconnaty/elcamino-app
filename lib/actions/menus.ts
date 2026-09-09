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
    .select("id, reservation_id, course, label, position, required")
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
 */
export async function setReservationMenu(reservationId: string, menu: MenuInput, departureId: string): Promise<Resultado> {
  const supabase = createClient();
  const { data: existentes } = await supabase.from("reservation_menu_courses").select("id").eq("reservation_id", reservationId);
  const cursosPrevios = new Set((existentes ?? []).map((c: any) => c.id));
  const cursosVistos = new Set<string>();

  for (let i = 0; i < menu.length; i++) {
    const c = menu[i];
    const fila = { reservation_id: reservationId, course: c.course, label: c.label?.trim() || null, position: i, required: c.required !== false };
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

    const { data: opsPrevias } = await supabase.from("reservation_menu_options").select("id").eq("course_id", courseId);
    const previas = new Set((opsPrevias ?? []).map((o: any) => o.id));
    const vistas = new Set<string>();
    for (let j = 0; j < c.options.length; j++) {
      const o = c.options[j];
      const name = o.name.trim();
      if (!name) continue;
      const filaOp = { course_id: courseId, name, description: o.description?.trim() || null, position: j };
      if (o.id && previas.has(o.id)) {
        const { error } = await supabase.from("reservation_menu_options").update(filaOp).eq("id", o.id);
        if (error) return { ok: false, error: error.message };
        vistas.add(o.id);
      } else {
        const { data, error } = await supabase.from("reservation_menu_options").insert(filaOp).select("id").single();
        if (error) return { ok: false, error: error.message };
        vistas.add(data.id);
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
