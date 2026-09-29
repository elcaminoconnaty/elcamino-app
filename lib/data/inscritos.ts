import "server-only";
import type { createClient } from "@/lib/supabase/server";

/**
 * Cuántos van en cada camino, con una sola regla: `departures.capacity` es el cupo de
 * PEREGRINOS que pagan, y el equipo (Naty, Nico) va aparte. Sale de `v_departure_finance`
 * (pagantes_count, team_count), la misma fuente del panorama y del punto de equilibrio.
 *
 * Antes cada pantalla contaba distinto: el panorama decía "13 / 15 + 2 equipo" y la lista de
 * caminos y los dashboards "15 / 15" (equipo incluido), como si el camino estuviera lleno.
 */
export type Conteo = { pagantes: number; equipo: number };

export async function conteoPorCamino(supabase: ReturnType<typeof createClient>): Promise<Map<string, Conteo>> {
  const { data } = await supabase.from("v_departure_finance").select("departure_id, pagantes_count, team_count");
  return new Map(
    (data ?? []).map((r: any) => [r.departure_id, { pagantes: Number(r.pagantes_count ?? 0), equipo: Number(r.team_count ?? 0) }])
  );
}

/** "13 / 15 + 2 equipo". */
export function textoCupo(c: Conteo | undefined, capacity: number | null | undefined): string {
  const pagantes = c?.pagantes ?? 0;
  const equipo = c?.equipo ?? 0;
  return `${pagantes}${capacity ? ` / ${capacity}` : ""}${equipo ? ` + ${equipo} equipo` : ""}`;
}
