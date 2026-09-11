import "server-only";
// El peregrino no tiene cuenta: todo este módulo corre sin sesión y se autoriza con el
// token de su enlace, que se comprueba antes de cada consulta. Ver lib/supabase/admin.ts.
//
// Hay dos enlaces:
//   - el personal (`registrations.menu_token`): identifica a una inscripción;
//   - el del camino (`departures.menu_token`): uno solo para el grupo, el peregrino elige
//     su nombre de la lista. La inscripción elegida se cruza SIEMPRE con el camino del
//     token; el id viene del cliente y no se le cree nada más.
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { menuFromRows, requiredCoursesFor, menuNeedsChoice, type MenuCourse } from "@/lib/data/menus";

/** Rechaza tokens cortos antes de tocar la base, para no dar pistas por tiempo de respuesta. */
export function tokenPlausible(token: string | undefined | null): token is string {
  return typeof token === "string" && /^[0-9a-f]{64}$/.test(token);
}

export type CenaParaElegir = {
  id: string;
  dia: number | null;
  fecha: string;
  restaurante: string;
  lugar: string | null;
  /** Es la cena incluida en el hotel, no un restaurante aparte. */
  delHotel: boolean;
  /** Lo que el equipo quiere que lea antes de elegir ("bebidas incluidas: agua y vino"). */
  nota: string | null;
  courses: MenuCourse[];
  /** courseId → optionId elegido. */
  elegido: Record<string, string>;
  noCena: boolean;
};

export type MenuParaElegir = {
  estado: "activo" | "inactivo";
  nombre: string;
  camino: string;
  cenas: CenaParaElegir[];
};

/** Cómo llegó el peregrino: por su enlace personal o por el del camino más su inscripción. */
export type Acceso = { token: string; registrationId?: string | null };

type Inscripcion = { id: string; pilgrim_id: string; departure_id: string; status: string; nombre: string; camino: string };

async function inscripcionPorTokenPersonal(supabase: any, token: string): Promise<Inscripcion | null> {
  if (!tokenPlausible(token)) return null;
  const { data: reg } = await supabase
    .from("registrations")
    .select("id, pilgrim_id, departure_id, status, pilgrims:pilgrim_id(full_name, deleted_at), departures:departure_id(name)")
    .eq("menu_token", token)
    .maybeSingle();
  if (!reg || !reg.pilgrims || reg.pilgrims.deleted_at) return null;
  return {
    id: reg.id,
    pilgrim_id: reg.pilgrim_id,
    departure_id: reg.departure_id,
    status: reg.status,
    nombre: reg.pilgrims.full_name,
    camino: reg.departures?.name ?? "tu Camino",
  };
}

async function caminoPorToken(supabase: any, token: string): Promise<{ id: string; name: string } | null> {
  if (!tokenPlausible(token)) return null;
  const { data } = await supabase.from("departures").select("id, name").eq("menu_token", token).maybeSingle();
  return data ?? null;
}

/** Con el token del camino: la inscripción tiene que ser de ESE camino. */
async function inscripcionPorTokenDeCamino(supabase: any, token: string, registrationId: string): Promise<Inscripcion | null> {
  const camino = await caminoPorToken(supabase, token);
  if (!camino) return null;
  if (!/^[0-9a-f-]{36}$/i.test(registrationId ?? "")) return null;
  const { data: reg } = await supabase
    .from("registrations")
    .select("id, pilgrim_id, departure_id, status, pilgrims:pilgrim_id(full_name, deleted_at)")
    .eq("id", registrationId)
    .eq("departure_id", camino.id)
    .maybeSingle();
  if (!reg || !reg.pilgrims || reg.pilgrims.deleted_at) return null;
  return { id: reg.id, pilgrim_id: reg.pilgrim_id, departure_id: reg.departure_id, status: reg.status, nombre: reg.pilgrims.full_name, camino: camino.name };
}

async function inscripcionPorAcceso(supabase: any, acceso: Acceso): Promise<Inscripcion | null> {
  return acceso.registrationId
    ? inscripcionPorTokenDeCamino(supabase, acceso.token, acceso.registrationId)
    : inscripcionPorTokenPersonal(supabase, acceso.token);
}

/** Las cenas del camino con el menú, lo elegido y los "no cena" de un peregrino. */
async function cenasDe(supabase: any, reg: Inscripcion): Promise<CenaParaElegir[]> {
  const { data: cenas } = await supabase
    .from("v_dinner_reservations")
    .select("reservation_id, day_number, check_in, location, provider_name, provider_city, via_meal_kind, via_rooms, menu_notes_pilgrim")
    .eq("departure_id", reg.departure_id)
    .order("check_in", { ascending: true, nullsFirst: false })
    .order("day_number", { ascending: true });
  const ids = (cenas ?? []).map((c: any) => c.reservation_id);
  if (ids.length === 0) return [];

  const [{ data: courses }, { data: choices }, { data: optOuts }] = await Promise.all([
    supabase.from("reservation_menu_courses").select("id, reservation_id, course, label, position, required, mode, depends_on_option_id").in("reservation_id", ids),
    supabase.from("meal_choices").select("reservation_id, course_id, option_id").in("reservation_id", ids).eq("pilgrim_id", reg.pilgrim_id),
    supabase.from("reservation_opt_outs").select("reservation_id").in("reservation_id", ids).eq("pilgrim_id", reg.pilgrim_id).eq("kind", "cena"),
  ]);
  const courseIds = (courses ?? []).map((c: any) => c.id);
  const { data: options } = courseIds.length
    ? await supabase.from("reservation_menu_options").select("id, course_id, name, description, position").in("course_id", courseIds)
    : { data: [] };

  const cursosPor = new Map<string, any[]>();
  for (const c of courses ?? []) cursosPor.set(c.reservation_id, [...(cursosPor.get(c.reservation_id) ?? []), c]);
  const elegidoPor = new Map<string, Record<string, string>>();
  for (const ch of choices ?? []) elegidoPor.set(ch.reservation_id, { ...(elegidoPor.get(ch.reservation_id) ?? {}), [ch.course_id]: ch.option_id });
  const noCena = new Set((optOuts ?? []).map((o: any) => o.reservation_id));

  return (cenas ?? []).map((c: any) => ({
    id: c.reservation_id,
    dia: c.day_number,
    fecha: c.check_in ? formatDate(c.check_in) : "",
    restaurante: c.provider_name,
    lugar: c.location ?? c.provider_city ?? null,
    delHotel: !c.via_meal_kind && !!c.via_rooms,
    nota: c.menu_notes_pilgrim ?? null,
    courses: menuFromRows(cursosPor.get(c.reservation_id) ?? [], options ?? []),
    elegido: elegidoPor.get(c.reservation_id) ?? {},
    noCena: noCena.has(c.reservation_id),
  }));
}

/**
 * Lo que ve quien abre su enlace. Devuelve `null` solo si el token no existe: una
 * inscripción cancelada tiene su propia pantalla, porque quien tuvo enlace no debe
 * toparse con "enlace no válido".
 */
export async function menuPorAcceso(acceso: Acceso): Promise<MenuParaElegir | null> {
  const supabase = createAdminClient();
  const reg = await inscripcionPorAcceso(supabase, acceso);
  if (!reg) return null;
  if (reg.status === "cancelado") return { estado: "inactivo", nombre: reg.nombre, camino: reg.camino, cenas: [] };
  return { estado: "activo", nombre: reg.nombre, camino: reg.camino, cenas: await cenasDe(supabase, reg) };
}

/** El enlace personal (compatibilidad: es lo que usa /menu/[token]). */
export async function menuPorToken(token: string): Promise<MenuParaElegir | null> {
  return menuPorAcceso({ token });
}

export type PeregrinoDeLista = { registration_id: string; nombre: string; completo: boolean; noCenaTodas: boolean };
export type ListaDelCamino = { camino: string; peregrinos: PeregrinoDeLista[]; hayCenas: boolean };

/**
 * La lista de nombres que ve quien abre el enlace del camino. Solo nombres: nada de lo
 * que eligió cada uno (eso se ve al entrar como esa persona).
 */
export async function listaPorTokenDeCamino(token: string): Promise<ListaDelCamino | null> {
  const supabase = createAdminClient();
  const camino = await caminoPorToken(supabase, token);
  if (!camino) return null;
  const [{ data: regs }, { data: cenas }] = await Promise.all([
    supabase
      .from("registrations")
      .select("id, pilgrim_id, status, pilgrims!inner(full_name, deleted_at)")
      .eq("departure_id", camino.id)
      .neq("status", "cancelado"),
    supabase.from("v_dinner_reservations").select("reservation_id").eq("departure_id", camino.id),
  ]);
  const gente = (regs ?? []).filter((r: any) => r.pilgrims && !r.pilgrims.deleted_at);
  const ids = (cenas ?? []).map((c: any) => c.reservation_id);

  // "Completo" = eligió en todas las cenas con algo que elegir (o avisó que no cena).
  let completos = new Set<string>();
  if (ids.length > 0 && gente.length > 0) {
    const [{ data: courses }, { data: choices }, { data: optOuts }] = await Promise.all([
      supabase.from("reservation_menu_courses").select("id, reservation_id, course, label, position, required, mode, depends_on_option_id").in("reservation_id", ids),
      supabase.from("meal_choices").select("reservation_id, pilgrim_id, course_id, option_id").in("reservation_id", ids),
      supabase.from("reservation_opt_outs").select("reservation_id, pilgrim_id").in("reservation_id", ids).eq("kind", "cena"),
    ]);
    const courseIds = (courses ?? []).map((c: any) => c.id);
    const { data: options } = courseIds.length
      ? await supabase.from("reservation_menu_options").select("id, course_id, name, description, position").in("course_id", courseIds)
      : { data: [] };
    const menus = new Map<string, MenuCourse[]>();
    for (const id of ids) menus.set(id, menuFromRows((courses ?? []).filter((c: any) => c.reservation_id === id), options ?? []));
    const conEleccion = ids.filter((id: string) => menuNeedsChoice(menus.get(id) ?? []));
    completos = new Set(
      gente
        .filter((r: any) =>
          conEleccion.every((id: string) => {
            if ((optOuts ?? []).some((o: any) => o.reservation_id === id && o.pilgrim_id === r.pilgrim_id)) return true;
            const fila: Record<string, string> = {};
            for (const ch of (choices ?? []).filter((x: any) => x.reservation_id === id && x.pilgrim_id === r.pilgrim_id)) fila[ch.course_id] = ch.option_id;
            const obligatorias = requiredCoursesFor(menus.get(id) ?? [], fila);
            return obligatorias.length > 0 && obligatorias.every((c) => !!fila[c.id]);
          })
        )
        .map((r: any) => r.id)
    );
    if (conEleccion.length === 0) completos = new Set();
  }

  return {
    camino: camino.name,
    hayCenas: ids.length > 0,
    peregrinos: gente
      .map((r: any) => ({ registration_id: r.id, nombre: r.pilgrims.full_name, completo: completos.has(r.id), noCenaTodas: false }))
      .sort((a: PeregrinoDeLista, b: PeregrinoDeLista) => a.nombre.localeCompare(b.nombre, "es")),
  };
}

type Resultado = { ok: true } | { ok: false; error: string };

/** Comprueba que la cena sea del camino de la inscripción: el id viene del cliente. */
async function cenaDelCamino(supabase: any, reg: Inscripcion, reservationId: string) {
  const { data } = await supabase
    .from("v_dinner_reservations")
    .select("reservation_id")
    .eq("departure_id", reg.departure_id)
    .eq("reservation_id", reservationId)
    .maybeSingle();
  return !!data;
}

/**
 * Guarda (o borra, con `optionId` null) lo que eligió el peregrino en una sección.
 * `pilgrim_id` y `departure_id` salen del token, nunca del cliente.
 */
export async function guardarEleccionPorAcceso(args: Acceso & {
  reservationId: string;
  courseId: string;
  optionId: string | null;
}): Promise<Resultado> {
  const supabase = createAdminClient();
  const reg = await inscripcionPorAcceso(supabase, args);
  if (!reg) return { ok: false, error: "Enlace no válido." };
  if (reg.status === "cancelado") return { ok: false, error: "Esta inscripción ya no está activa." };
  if (!(await cenaDelCamino(supabase, reg, args.reservationId))) return { ok: false, error: "Esa cena no es de tu camino." };

  const { data: course } = await supabase
    .from("reservation_menu_courses")
    .select("id, mode, depends_on_option_id")
    .eq("id", args.courseId)
    .eq("reservation_id", args.reservationId)
    .maybeSingle();
  if (!course) return { ok: false, error: "El menú cambió. Recarga la página." };
  if (course.mode !== "peregrino") return { ok: false, error: "Esa parte del menú no se elige." };

  if (!args.optionId) {
    const { error } = await supabase
      .from("meal_choices")
      .delete()
      .eq("reservation_id", args.reservationId)
      .eq("pilgrim_id", reg.pilgrim_id)
      .eq("course_id", args.courseId);
    if (error) return { ok: false, error: "No se pudo guardar. Vuelve a intentar." };
  } else {
    const { data: option } = await supabase
      .from("reservation_menu_options")
      .select("id")
      .eq("id", args.optionId)
      .eq("course_id", args.courseId)
      .maybeSingle();
    if (!option) return { ok: false, error: "Ese plato ya no está en el menú. Recarga la página." };
    if (course.depends_on_option_id) {
      // Sección condicional: solo vale si eligió la opción de la que depende.
      const { data: padre } = await supabase
        .from("meal_choices")
        .select("id")
        .eq("reservation_id", args.reservationId)
        .eq("pilgrim_id", reg.pilgrim_id)
        .eq("option_id", course.depends_on_option_id)
        .maybeSingle();
      if (!padre) return { ok: false, error: "Primero elige la opción anterior." };
    }
    // Si había dicho que no cenaba, elegir un plato lo desmarca.
    await supabase.from("reservation_opt_outs").delete().eq("reservation_id", args.reservationId).eq("pilgrim_id", reg.pilgrim_id).eq("kind", "cena");
    const { error } = await supabase.from("meal_choices").upsert(
      {
        reservation_id: args.reservationId,
        pilgrim_id: reg.pilgrim_id,
        course_id: args.courseId,
        option_id: args.optionId,
        chosen_via: "peregrino",
      },
      { onConflict: "reservation_id,pilgrim_id,course_id" }
    );
    if (error) return { ok: false, error: "No se pudo guardar. Vuelve a intentar." };
  }
  // Si cambió la opción de la que dependen otras secciones, esas elecciones sobran.
  await supabase.rpc("prune_dependent_choices", { p_reservation_id: args.reservationId, p_pilgrim_id: reg.pilgrim_id });
  revalidatePath(`/caminos/${reg.departure_id}`);
  return { ok: true };
}

/** "No voy a cenar esta noche" (o deshacerlo). Al marcarlo se borran sus elecciones de esa cena. */
export async function marcarNoCenaPorAcceso(args: Acceso & { reservationId: string; noCena: boolean }): Promise<Resultado> {
  const supabase = createAdminClient();
  const reg = await inscripcionPorAcceso(supabase, args);
  if (!reg) return { ok: false, error: "Enlace no válido." };
  if (reg.status === "cancelado") return { ok: false, error: "Esta inscripción ya no está activa." };
  if (!(await cenaDelCamino(supabase, reg, args.reservationId))) return { ok: false, error: "Esa cena no es de tu camino." };

  if (args.noCena) {
    await supabase.from("meal_choices").delete().eq("reservation_id", args.reservationId).eq("pilgrim_id", reg.pilgrim_id);
    const { error } = await supabase.from("reservation_opt_outs").upsert(
      { reservation_id: args.reservationId, pilgrim_id: reg.pilgrim_id, kind: "cena", reason: "Avisó desde su enlace" },
      { onConflict: "reservation_id,pilgrim_id,kind" }
    );
    if (error) return { ok: false, error: "No se pudo guardar. Vuelve a intentar." };
  } else {
    const { error } = await supabase.from("reservation_opt_outs").delete().eq("reservation_id", args.reservationId).eq("pilgrim_id", reg.pilgrim_id).eq("kind", "cena");
    if (error) return { ok: false, error: "No se pudo guardar. Vuelve a intentar." };
  }
  revalidatePath(`/caminos/${reg.departure_id}`);
  return { ok: true };
}

// Compatibilidad con la firma anterior (enlace personal).
export async function guardarEleccionPorToken(args: { token: string; reservationId: string; courseId: string; optionId: string | null }): Promise<Resultado> {
  return guardarEleccionPorAcceso(args);
}
export async function marcarNoCenaPorToken(args: { token: string; reservationId: string; noCena: boolean }): Promise<Resultado> {
  return marcarNoCenaPorAcceso(args);
}
