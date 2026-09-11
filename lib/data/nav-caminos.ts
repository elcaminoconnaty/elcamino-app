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
  status: string;
  peregrinos: NavPeregrino[];
};

export function ordenarCaminos<T extends { start_date: string | null; status: string }>(caminos: T[]): T[] {
  const fecha = (c: T) => c.start_date ?? "";
  const vigentes = caminos.filter((c) => c.status !== "finished").sort((a, b) => fecha(a).localeCompare(fecha(b)));
  const terminados = caminos.filter((c) => c.status === "finished").sort((a, b) => fecha(b).localeCompare(fecha(a)));
  return [...vigentes, ...terminados];
}

export async function navCaminos(supabase: any): Promise<NavCamino[]> {
  const [{ data: departures }, { data: registrations }] = await Promise.all([
    supabase.from("departures").select("id, name, start_date, end_date, status").neq("status", "cancelled"),
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
    status: d.status,
    peregrinos: (porCamino.get(d.id) ?? []).sort((a, b) => a.full_name.localeCompare(b.full_name, "es")),
  }));

  return ordenarCaminos(caminos);
}
