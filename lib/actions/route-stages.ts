"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Las etapas de una ruta.
 *
 * Hasta ahora se leían desde el asistente y el documento de viaje pero no se podían editar
 * en ningún sitio: había que tocarlas por SQL. Son el esqueleto de todo — el itinerario del
 * documento, el trazado del mapa y los días del presupuesto salen de acá.
 *
 * Van por ruta y no por camino: el Francés de septiembre y el de abril comparten etapas. Si
 * un día hay que cambiarlas solo para una salida, esa salida necesita su propia ruta.
 */

export type EtapaInput = {
  day_offset: number;
  day_kind: string;
  from_place: string | null;
  to_place: string | null;
  km: number | null;
  hours_approx: string | null;
  description: string | null;
};

/**
 * Reemplaza las etapas de la ruta.
 *
 * Borra y reinserta, igual que el plan de pagos: son pocas filas, nada cuelga de su id, y
 * evita el baile de altas, bajas y reordenamientos.
 */
export async function guardarEtapas(routeId: string, etapas: EtapaInput[]) {
  const supabase = createClient();

  const offsets = etapas.map((e) => e.day_offset);
  if (new Set(offsets).size !== offsets.length) {
    throw new Error("Hay dos etapas con el mismo número de día.");
  }
  if (offsets.some((o) => o === 0)) {
    throw new Error("El día 1 es el primero: no existe el día 0. Los negativos son pre-camino.");
  }

  const { error: errBorrado } = await supabase.from("route_stages").delete().eq("route_id", routeId);
  if (errBorrado) throw new Error(errBorrado.message);

  if (etapas.length) {
    const { error } = await supabase.from("route_stages").insert(
      etapas
        .slice()
        .sort((a, b) => a.day_offset - b.day_offset)
        .map((e, i) => ({
          route_id: routeId,
          day_offset: e.day_offset,
          day_kind: e.day_kind,
          from_place: e.from_place || null,
          to_place: e.to_place || null,
          km: e.km ?? null,
          hours_approx: e.hours_approx || null,
          description: e.description || null,
          position: i,
        }))
    );
    if (error) throw new Error(error.message);
  }

  revalidatePath("/configuracion");
  revalidatePath("/caminos");
}

export async function leerEtapas(routeId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("route_stages")
    .select("day_offset, day_kind, from_place, to_place, km, hours_approx, description")
    .eq("route_id", routeId)
    .order("day_offset");
  return (data ?? []) as EtapaInput[];
}
