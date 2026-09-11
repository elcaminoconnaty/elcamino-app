/**
 * Elección de menú por peregrino en cada cena. Todo acá es puro: lo usan igual el
 * tablero (para previsualizar sin ir al servidor), la página pública del peregrino y
 * las server actions (para validar antes de escribir). Es el espejo de `rooming.ts`.
 *
 * Cada sección tiene un modo:
 *   - `peregrino`: el peregrino elige entre los platos (lo de siempre).
 *   - `fijo`: va igual para todos; el equipo carga UN plato y nadie elige.
 *   - `en_sitio`: se elige en el restaurante; no lleva platos ni se manda al proveedor.
 * Y puede ser condicional: solo aplica si el peregrino eligió cierta opción en una
 * sección anterior (O Pedrouzo: "Primero" solo si eligió "Menú completo").
 */

export type CourseKind = "entrada" | "fuerte" | "postre" | "bebida" | "otro";
export type CourseMode = "peregrino" | "fijo" | "en_sitio";

export const COURSE_LABELS: Record<CourseKind, string> = {
  entrada: "Entrada",
  fuerte: "Plato fuerte",
  postre: "Postre",
  bebida: "Bebida",
  otro: "Otro",
};

export const COURSE_MODE_LABELS: Record<CourseMode, string> = {
  peregrino: "Elige el peregrino",
  fijo: "Igual para todos",
  en_sitio: "Se elige en el restaurante",
};

/** El orden natural en que se sirve, y en que se muestra. */
export const COURSE_ORDER: CourseKind[] = ["entrada", "fuerte", "postre", "bebida", "otro"];

export type MenuOption = {
  id: string;
  name: string;
  description: string | null;
  position: number;
};

export type MenuCourse = {
  id: string;
  course: CourseKind;
  label: string | null;
  position: number;
  /** Si es falsa, elegir esta sección no cuenta para "ya eligió" (p. ej. la bebida). */
  required: boolean;
  mode: CourseMode;
  /** Solo aplica si el peregrino eligió esta opción (de una sección anterior). */
  depends_on_option_id: string | null;
  options: MenuOption[];
};

/**
 * Lo que manda el editor del menú. Con `id` se actualiza, sin `id` se crea. La
 * dependencia va por índices (sección, plato) porque las secciones nuevas no tienen id.
 */
export type MenuInput = {
  id?: string;
  course: CourseKind;
  label?: string | null;
  required: boolean;
  mode?: CourseMode;
  depends_on?: { course_index: number; option_index: number } | null;
  options: { id?: string; name: string; description?: string | null }[];
}[];

export type ChoiceInput = {
  pilgrim_id: string;
  course_id: string;
  option_id: string;
  notes?: string | null;
};

/** grid[pilgrimId][courseId] = optionId, o "" si no eligió (para el <select> controlado). */
export type ChoiceGrid = Record<string, Record<string, string>>;
/** Una fila de la grilla: courseId → optionId. */
export type ChoiceRow = Record<string, string>;

/** Anida las filas de la base (secciones + platos) y las ordena. */
export function menuFromRows(courses: any[], options: any[]): MenuCourse[] {
  const porCurso = new Map<string, MenuOption[]>();
  for (const o of options ?? []) {
    porCurso.set(o.course_id, [
      ...(porCurso.get(o.course_id) ?? []),
      { id: o.id, name: o.name, description: o.description ?? null, position: Number(o.position ?? 0) },
    ]);
  }
  return (courses ?? [])
    .map((c: any) => ({
      id: c.id,
      course: c.course as CourseKind,
      label: c.label ?? null,
      position: Number(c.position ?? 0),
      required: c.required !== false,
      mode: (c.mode ?? "peregrino") as CourseMode,
      depends_on_option_id: c.depends_on_option_id ?? null,
      options: (porCurso.get(c.id) ?? []).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "es")),
    }))
    .sort((a: MenuCourse, b: MenuCourse) => a.position - b.position || COURSE_ORDER.indexOf(a.course) - COURSE_ORDER.indexOf(b.course));
}

export function courseTitle(c: { course: CourseKind; label?: string | null }): string {
  return c.label?.trim() || COURSE_LABELS[c.course] || c.course;
}

/** Sin nada cargado. Una sección "en el restaurante" cuenta como cargada aunque no tenga platos. */
export function menuIsEmpty(courses: MenuCourse[]): boolean {
  return courses.length === 0 || courses.every((c) => c.options.length === 0 && c.mode !== "en_sitio");
}

/** Hay algo que el peregrino tenga que elegir. Si no, el menú es todo fijo. */
export function menuNeedsChoice(courses: MenuCourse[]): boolean {
  return courses.some((c) => c.mode === "peregrino" && c.options.length > 0);
}

/** La sección y el plato de los que depende una sección condicional, si existen. */
export function parentOf(course: MenuCourse, courses: MenuCourse[]): { course: MenuCourse; option: MenuOption } | null {
  if (!course.depends_on_option_id) return null;
  for (const c of courses) {
    const option = c.options.find((o) => o.id === course.depends_on_option_id);
    if (option) return { course: c, option };
  }
  return null;
}

/** Si la sección aplica para un peregrino según lo que eligió en la sección padre. */
export function courseApplies(course: MenuCourse, fila: ChoiceRow | undefined, courses: MenuCourse[]): boolean {
  if (!course.depends_on_option_id) return true;
  const padre = parentOf(course, courses);
  if (!padre) return true; // la opción padre ya no existe: no bloquea
  return (fila?.[padre.course.id] ?? "") === padre.option.id;
}

/** Las secciones en las que ese peregrino tiene que elegir para estar completo. */
export function requiredCoursesFor(courses: MenuCourse[], fila: ChoiceRow | undefined): MenuCourse[] {
  return courses.filter((c) => c.mode === "peregrino" && c.required && c.options.length > 0 && courseApplies(c, fila, courses));
}

/** Los platos que van para todos, en orden del menú. */
export function fixedDishes(courses: MenuCourse[]): { course: MenuCourse; option: MenuOption }[] {
  return courses.filter((c) => c.mode === "fijo" && c.options.length > 0).map((c) => ({ course: c, option: c.options[0] }));
}

/** Las secciones que dependen de alguna opción de esta sección. */
export function dependentsOf(course: MenuCourse, courses: MenuCourse[]): MenuCourse[] {
  const ids = new Set(course.options.map((o) => o.id));
  return courses.filter((c) => c.depends_on_option_id && ids.has(c.depends_on_option_id));
}

/**
 * Aplica una elección a la fila y limpia las secciones condicionales que dejan de
 * aplicar (cambió de "Menú completo" a "Pizza": el primero y el segundo se vacían).
 */
export function applyChoice(fila: ChoiceRow, courseId: string, optionId: string, courses: MenuCourse[]): ChoiceRow {
  const next: ChoiceRow = { ...fila, [courseId]: optionId };
  for (const c of courses) {
    if (c.depends_on_option_id && !courseApplies(c, next, courses) && next[c.id]) next[c.id] = "";
  }
  return next;
}

export function emptyGrid(pilgrimIds: string[], courses: MenuCourse[]): ChoiceGrid {
  const grid: ChoiceGrid = {};
  for (const p of pilgrimIds) {
    grid[p] = {};
    for (const c of courses) grid[p][c.id] = "";
  }
  return grid;
}

/** Acomoda las elecciones guardadas en la grilla. Las huérfanas (plato o sección borrados, sección que no elige el peregrino) se ignoran. */
export function gridFromChoices(pilgrimIds: string[], courses: MenuCourse[], choices: any[]): ChoiceGrid {
  const grid = emptyGrid(pilgrimIds, courses);
  const validas = new Map(courses.filter((c) => c.mode === "peregrino").map((c) => [c.id, new Set(c.options.map((o) => o.id))]));
  for (const ch of choices ?? []) {
    if (!grid[ch.pilgrim_id]) continue;
    if (!validas.get(ch.course_id)?.has(ch.option_id)) continue;
    grid[ch.pilgrim_id][ch.course_id] = ch.option_id;
  }
  return grid;
}

/** Lo contrario: de la grilla a filas para guardar. Descarta vacíos, lo que ya no existe en el menú y lo que no aplica. */
export function choicesFromGrid(grid: ChoiceGrid, courses: MenuCourse[]): ChoiceInput[] {
  const porId = new Map(courses.map((c) => [c.id, c]));
  const out: ChoiceInput[] = [];
  for (const [pilgrim_id, fila] of Object.entries(grid)) {
    for (const [course_id, option_id] of Object.entries(fila)) {
      if (!option_id) continue;
      const c = porId.get(course_id);
      if (!c || c.mode !== "peregrino") continue;
      if (!c.options.some((o) => o.id === option_id)) continue;
      if (!courseApplies(c, fila, courses)) continue;
      out.push({ pilgrim_id, course_id, option_id });
    }
  }
  return out;
}

/**
 * Reacomoda la grilla sobre un menú que cambió (alguien editó el menú mientras el tablero
 * estaba abierto). Lo que sigue existiendo se conserva; `perdidas` cuenta lo que no.
 */
export function reconcileGrid(prev: ChoiceGrid, pilgrimIds: string[], courses: MenuCourse[]) {
  const grid = emptyGrid(pilgrimIds, courses);
  const validas = new Map(courses.filter((c) => c.mode === "peregrino").map((c) => [c.id, new Set(c.options.map((o) => o.id))]));
  let perdidas = 0;
  for (const [p, porCurso] of Object.entries(prev)) {
    for (const [c, o] of Object.entries(porCurso)) {
      if (!o) continue;
      if (grid[p] && validas.get(c)?.has(o)) grid[p][c] = o;
      else perdidas++;
    }
  }
  return { grid, perdidas };
}

/** Huella estable de lo que manda el servidor: si cambia, el tablero resincroniza. */
export function menuSignature(
  dinners: { id: string; courses: MenuCourse[]; choices: any[]; optOuts?: string[] }[]
): string {
  return dinners
    .map((d) => {
      const menu = d.courses
        .map((c) => `${c.id}:${c.course}:${c.required ? 1 : 0}:${c.mode}:${c.depends_on_option_id ?? ""}:${c.options.map((o) => `${o.id}=${o.name}`).sort().join("+")}`)
        .sort()
        .join(",");
      const ch = (d.choices ?? [])
        .map((x: any) => `${x.pilgrim_id}:${x.course_id}:${x.option_id}:${x.chosen_via ?? ""}`)
        .sort()
        .join(",");
      const opt = [...(d.optOuts ?? [])].sort().join(",");
      return `${d.id}|${menu}|${ch}|${opt}`;
    })
    .sort()
    .join("\n");
}

/**
 * Reglas que tiene que cumplir un conjunto de elecciones antes de guardarse. La UI ya
 * las respeta, pero la server action las vuelve a correr contra el menú real.
 * Devuelve el mensaje del problema, o null si está bien.
 */
export function validateChoices(choices: ChoiceInput[], courses: MenuCourse[], optOuts: Iterable<string> = []): string | null {
  const porId = new Map(courses.map((c) => [c.id, c]));
  const excluidos = new Set(optOuts);
  const vistos = new Set<string>();
  const filas = new Map<string, ChoiceRow>();
  for (const ch of choices) filas.set(ch.pilgrim_id, { ...(filas.get(ch.pilgrim_id) ?? {}), [ch.course_id]: ch.option_id });
  for (const ch of choices) {
    const c = porId.get(ch.course_id);
    if (!c) return "Hay una sección que ya no está en el menú";
    if (c.mode !== "peregrino") return "Hay una elección en una sección que no elige el peregrino";
    if (!c.options.some((o) => o.id === ch.option_id)) return "Hay un plato que ya no está en el menú";
    if (excluidos.has(ch.pilgrim_id)) return "Alguien eligió menú y a la vez está marcado como que no cena";
    if (!courseApplies(c, filas.get(ch.pilgrim_id), courses)) return `Hay una elección en "${courseTitle(c)}" que no aplica con lo que eligió antes`;
    const key = `${ch.pilgrim_id}:${ch.course_id}`;
    if (vistos.has(key)) return "Un peregrino quedó con dos platos en la misma sección";
    vistos.add(key);
  }
  return null;
}

/**
 * Estado de una cena. Alguien está "completo" cuando eligió en todas las secciones
 * obligatorias que le aplican; si el menú no tiene nada que elegir (todo fijo), todos
 * están completos. La cena está completa cuando todos eligieron o no cenan.
 */
export function dinnerProgress(pilgrimIds: string[], grid: ChoiceGrid, courses: MenuCourse[], optOuts: Iterable<string>) {
  const ex = new Set(optOuts);
  const hayQueElegir = menuNeedsChoice(courses);
  const completos: string[] = [];
  const pendientes: string[] = [];
  const noCenan: string[] = [];
  for (const p of pilgrimIds) {
    if (ex.has(p)) {
      noCenan.push(p);
      continue;
    }
    const fila = grid[p] ?? {};
    let listo: boolean;
    if (!hayQueElegir) listo = !menuIsEmpty(courses);
    else {
      const obligatorias = requiredCoursesFor(courses, fila);
      listo = obligatorias.length > 0 && obligatorias.every((c) => !!fila[c.id]);
    }
    (listo ? completos : pendientes).push(p);
  }
  const completa = pilgrimIds.length > 0 && pendientes.length === 0 && !menuIsEmpty(courses);
  return { completos, pendientes, noCenan, completa, hayQueElegir };
}

/**
 * Cuántos de cada plato hay que pedir. Es lo que el restaurante quiere saber. Los platos
 * fijos van para todos los que cenan (`todos: true`); lo "en el restaurante" no se cuenta.
 */
export function countByOption(grid: ChoiceGrid, courses: MenuCourse[], optOuts: Iterable<string> = []) {
  const ex = new Set(optOuts);
  const conteo = new Map<string, number>();
  let comensales = 0;
  for (const [p, fila] of Object.entries(grid)) {
    if (ex.has(p)) continue;
    comensales++;
    for (const [cid, o] of Object.entries(fila)) {
      if (!o) continue;
      const c = courses.find((x) => x.id === cid);
      if (!c || c.mode !== "peregrino" || !courseApplies(c, fila, courses)) continue;
      conteo.set(`${cid}:${o}`, (conteo.get(`${cid}:${o}`) ?? 0) + 1);
    }
  }
  const out: { course: MenuCourse; option: MenuOption; n: number; todos: boolean }[] = [];
  for (const course of courses) {
    if (course.mode === "fijo") {
      if (course.options[0] && comensales > 0) out.push({ course, option: course.options[0], n: comensales, todos: true });
      continue;
    }
    if (course.mode !== "peregrino") continue;
    for (const option of course.options) {
      const n = conteo.get(`${course.id}:${option.id}`) ?? 0;
      if (n > 0) out.push({ course, option, n, todos: false });
    }
  }
  return out;
}

/** El menú sin ids, para cargarlo en otra reserva ("copiar el de la última vez"). Las dependencias pasan a índices. */
export function copyMenu(source: MenuCourse[]): MenuInput {
  return source.map((c) => {
    let depends_on: { course_index: number; option_index: number } | null = null;
    if (c.depends_on_option_id) {
      const ci = source.findIndex((x) => x.options.some((o) => o.id === c.depends_on_option_id));
      if (ci >= 0) depends_on = { course_index: ci, option_index: source[ci].options.findIndex((o) => o.id === c.depends_on_option_id) };
    }
    return {
      course: c.course,
      label: c.label,
      required: c.required,
      mode: c.mode,
      depends_on,
      options: c.options.map((o) => ({ name: o.name, description: o.description })),
    };
  });
}
