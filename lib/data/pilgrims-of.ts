/**
 * Los inscritos vigentes de un camino (inscripción no cancelada, peregrino no borrado),
 * ordenados por nombre. Lo usan los tableros de habitaciones y de cenas.
 */
export type PilgrimOf = {
  id: string;
  registration_id: string;
  full_name: string;
  sex: string | null;
  is_team: boolean;
  dietary_notes: string | null;
};

export async function pilgrimsOf(supabase: any, departureId: string): Promise<PilgrimOf[]> {
  const { data } = await supabase
    .from("registrations")
    .select("id, status, pilgrims!inner(id, full_name, sex, is_team, deleted_at, dietary_notes)")
    .eq("departure_id", departureId)
    .neq("status", "cancelado");
  return (data ?? [])
    .filter((r: any) => r.pilgrims && !r.pilgrims.deleted_at)
    .map((r: any) => ({
      id: r.pilgrims.id,
      registration_id: r.id,
      full_name: r.pilgrims.full_name,
      sex: r.pilgrims.sex,
      is_team: !!r.pilgrims.is_team,
      dietary_notes: r.pilgrims.dietary_notes ?? null,
    }))
    .sort((a: PilgrimOf, b: PilgrimOf) => a.full_name.localeCompare(b.full_name, "es"));
}
