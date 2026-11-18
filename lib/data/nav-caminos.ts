import { hoyBogota } from "@/lib/utils";

/**
 * Los caminos vigentes con sus peregrinos inscritos, para el menú lateral y para la
 * lista general de peregrinos agrupada por camino.
 *
 * Orden: primero los caminos por venir o en curso (del más próximo al más lejano) y
 * después los ya terminados (del más reciente al más antiguo).
 */
export type NavPeregrino = { id: string; full_name: string };

export type NavCamino = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  /** Día del encuentro (Sarria, Oporto): el viaje del peregrino arranca acá, un día antes de caminar. */
  contract_start_date?: string | null;
  status: string;
  peregrinos: NavPeregrino[];
};

/**
 * ¿El camino ya pasó? Terminado a mano (`finished`) o con la fecha de fin antes de hoy: un camino
 * que nadie cerró en la plataforma (p. ej. Septiembre 2026 seguía "open") no debe quedar de primero.
 */
export function caminoPasado(c: { end_date?: string | null; status: string }, hoy: string = hoyBogota()): boolean {
  return c.status === "finished" || (!!c.end_date && c.end_date < hoy);
}

export function ordenarCaminos<T extends { start_date: string | null; end_date?: string | null; status: string }>(caminos: T[]): T[] {
  const hoy = hoyBogota();
  const fecha = (c: T) => c.start_date ?? "";
  const vigentes = caminos.filter((c) => !caminoPasado(c, hoy)).sort((a, b) => fecha(a).localeCompare(fecha(b)));
  const terminados = caminos.filter((c) => caminoPasado(c, hoy)).sort((a, b) => fecha(b).localeCompare(fecha(a)));
  return [...vigentes, ...terminados];
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Cómo se muestra un camino en el menú, que es angosto: todos los nombres empiezan por
 * "Camino Francés — …", así que cortados se veían iguales. Arriba va la ruta corta
 * ("Francés", "Portugués Costero"), el aliado aparte y abajo las fechas ("2 – 8 sep 2027").
 */
export function etiquetaCamino(c: { name: string; start_date: string | null; end_date: string | null; contract_start_date?: string | null }): {
  ruta: string;
  aliado: string | null;
  fechas: string | null;
} {
  let nombre = c.name.trim();
  const aliado = nombre.match(/\(([^)]+)\)\s*$/)?.[1]?.trim() ?? null;
  if (aliado) nombre = nombre.replace(/\s*\([^)]+\)\s*$/, "");
  // "Camino Francés — Septiembre 2027" → "Francés"; también con guion simple.
  nombre = nombre.split(/\s+[—–-]\s+/)[0].replace(/^Camino\s+(de\s+Santiago\s+)?/i, "").trim();
  return { ruta: nombre || c.name, aliado, fechas: rangoCorto(c.contract_start_date ?? c.start_date, c.end_date) };
}

function rangoCorto(inicio: string | null, fin: string | null): string | null {
  if (!inicio) return null;
  const [ai, mi, di] = inicio.split("-").map(Number);
  if (!fin) return `${di} ${MESES[mi - 1]} ${ai}`;
  const [af, mf, df] = fin.split("-").map(Number);
  if (ai !== af) return `${di} ${MESES[mi - 1]} ${ai} – ${df} ${MESES[mf - 1]} ${af}`;
  if (mi !== mf) return `${di} ${MESES[mi - 1]} – ${df} ${MESES[mf - 1]} ${af}`;
  return `${di} – ${df} ${MESES[mf - 1]} ${af}`;
}

export async function navCaminos(supabase: any): Promise<NavCamino[]> {
  const [{ data: departures }, { data: registrations }] = await Promise.all([
    supabase.from("departures").select("id, name, start_date, end_date, contract_start_date, status").neq("status", "cancelled"),
    supabase
      .from("registrations")
      .select("departure_id, pilgrims!inner(id, full_name, deleted_at)")
      .neq("status", "cancelado"),
  ]);

  const porCamino = new Map<string, NavPeregrino[]>();
  for (const r of registrations ?? []) {
    if (!r.pilgrims || r.pilgrims.deleted_at) continue;
    const lista = porCamino.get(r.departure_id) ?? [];
    // Un peregrino puede tener más de una inscripción al mismo camino (p. ej. un cambio de plan).
    if (!lista.some((p) => p.id === r.pilgrims.id)) lista.push({ id: r.pilgrims.id, full_name: r.pilgrims.full_name });
    porCamino.set(r.departure_id, lista);
  }

  const caminos: NavCamino[] = (departures ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    start_date: d.start_date,
    end_date: d.end_date,
    contract_start_date: d.contract_start_date ?? null,
    status: d.status,
    peregrinos: (porCamino.get(d.id) ?? []).sort((a, b) => a.full_name.localeCompare(b.full_name, "es")),
  }));

  return ordenarCaminos(caminos);
}
