/**
 * Elección de menú por peregrino en cada cena. Todo acá es puro: lo usan igual el
 * tablero (para previsualizar sin ir al servidor), la página pública del peregrino y
 * las server actions (para validar antes de escribir). Es el espejo de `rooming.ts`.
 */

export type CourseKind = "entrada" | "fuerte" | "postre" | "bebida" | "otro";

export const COURSE_LABELS: Record<CourseKind, string> = {
  entrada: "Entrada",
  fuerte: "Plato fuerte",
  postre: "Postre",
  bebida: "Bebida",
  otro: "Otro",
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
  options: MenuOption[];
};

/** Lo que manda el editor del menú. Con `id` se actualiza, sin `id` se crea. */
export type MenuInput = {
  id?: string;
  course: CourseKind;
  label?: string | null;
  required: boolean;
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
      options: (porCurso.get(c.id) ?? []).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "es")),
    }))
    .sort((a: MenuCourse, b: MenuCourse) => a.position - b.position || COURSE_ORDER.indexOf(a.course) - COURSE_ORDER.indexOf(b.course));
}

export function courseTitle(c: { course: CourseKind; label?: string | null }): string {
  return c.label?.trim() || COURSE_LABELS[c.course] || c.course;
}

export function menuIsEmpty(courses: MenuCourse[]): boolean {
  return courses.length === 0 || courses.every((c) => c.options.length === 0);
}

export function emptyGrid(pilgrimIds: string[], courses: MenuCourse[]): ChoiceGrid {
  const grid: ChoiceGrid = {};
  for (const p of pilgrimIds) {
    grid[p] = {};
    for (const c of courses) grid[p][c.id] = "";
  }
  return grid;
}

/** Acomoda las elecciones guardadas en la grilla. Las huérfanas (plato o sección borrados) se ignoran. */
export function gridFromChoices(pilgrimIds: string[], courses: MenuCourse[], choices: any[]): ChoiceGrid {
  const grid = emptyGrid(pilgrimIds, courses);
  const validas = new Map(courses.map((c) => [c.id, new Set(c.options.map((o) => o.id))]));
  for (const ch of choices ?? []) {
    if (!grid[ch.pilgrim_id]) continue;
    if (!validas.get(ch.course_id)?.has(ch.option_id)) continue;
    grid[ch.pilgrim_id][ch.course_id] = ch.option_id;
  }
  return grid;
}

/** Lo contrario: de la grilla a filas para guardar. Descarta vacíos y lo que ya no existe en el menú. */
export function choicesFromGrid(grid: ChoiceGrid, courses: MenuCourse[]): ChoiceInput[] {
  const validas = new Map(courses.map((c) => [c.id, new Set(c.options.map((o) => o.id))]));
  const out: ChoiceInput[] = [];
  for (const [pilgrim_id, porCurso] of Object.entries(grid)) {
    for (const [course_id, option_id] of Object.entries(porCurso)) {
      if (!option_id) continue;
      if (!validas.get(course_id)?.has(option_id)) continue;
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
  const validas = new Map(courses.map((c) => [c.id, new Set(c.options.map((o) => o.id))]));
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
        .map((c) => `${c.id}:${c.course}:${c.required ? 1 : 0}:${c.options.map((o) => `${o.id}=${o.name}`).sort().join("+")}`)
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
  const validas = new Map(courses.map((c) => [c.id, new Set(c.options.map((o) => o.id))]));
  const excluidos = new Set(optOuts);
  const vistos = new Set<string>();
  for (const ch of choices) {
    const opciones = validas.get(ch.course_id);
    if (!opciones) return "Hay una sección que ya no está en el menú";
    if (!opciones.has(ch.option_id)) return "Hay un plato que ya no está en el menú";
    if (excluidos.has(ch.pilgrim_id)) return "Alguien eligió menú y a la vez está marcado como que no cena";
    const key = `${ch.pilgrim_id}:${ch.course_id}`;
    if (vistos.has(key)) return "Un peregrino quedó con dos platos en la misma sección";
    vistos.add(key);
  }
  return null;
}

/**
 * Estado de una cena. Alguien está "completo" cuando eligió en todas las secciones
 * obligatorias; la cena está completa cuando todos eligieron o no cenan.
 */
export function dinnerProgress(pilgrimIds: string[], grid: ChoiceGrid, courses: MenuCourse[], optOuts: Iterable<string>) {
  const ex = new Set(optOuts);
  const obligatorias = courses.filter((c) => c.required && c.options.length > 0).map((c) => c.id);
  const completos: string[] = [];
  const pendientes: string[] = [];
  const noCenan: string[] = [];
  for (const p of pilgrimIds) {
    if (ex.has(p)) {
      noCenan.push(p);
      continue;
    }
    const fila = grid[p] ?? {};
    const listo = obligatorias.length > 0 && obligatorias.every((c) => !!fila[c]);
    (listo ? completos : pendientes).push(p);
  }
  const completa = pilgrimIds.length > 0 && pendientes.length === 0 && obligatorias.length > 0;
  return { completos, pendientes, noCenan, completa };
}

/** Cuántos de cada plato hay que pedir. Es lo que el restaurante quiere saber. */
export function countByOption(grid: ChoiceGrid, courses: MenuCourse[], optOuts: Iterable<string> = []) {
  const ex = new Set(optOuts);
  const conteo = new Map<string, number>();
  for (const [p, porCurso] of Object.entries(grid)) {
    if (ex.has(p)) continue;
    for (const [c, o] of Object.entries(porCurso)) if (o) conteo.set(`${c}:${o}`, (conteo.get(`${c}:${o}`) ?? 0) + 1);
  }
  const out: { course: MenuCourse; option: MenuOption; n: number }[] = [];
  for (const course of courses) {
    for (const option of course.options) {
      const n = conteo.get(`${course.id}:${option.id}`) ?? 0;
      if (n > 0) out.push({ course, option, n });
    }
  }
  return out;
}

/** El menú sin ids, para cargarlo en otra reserva ("copiar el de la última vez"). */
export function copyMenu(source: MenuCourse[]): MenuInput {
  return source.map((c) => ({
    course: c.course,
    label: c.label,
    required: c.required,
    options: c.options.map((o) => ({ name: o.name, description: o.description })),
  }));
}
