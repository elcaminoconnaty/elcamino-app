"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { fechaDeDia, tieneDiaCero } from "@/lib/rutas-fechas";
import type { BudgetStatus } from "@/lib/constants";

/**
 * El camino con su ruta y la regla de fechas de esa ruta. Las fechas salen de la fuente
 * única `lib/rutas-fechas.ts` (la misma de la carta y el documento de viaje): una copia
 * propia trataba el día 0 como el 1 y en el Portugués corría los días previos.
 */
async function caminoConFechas(supabase: ReturnType<typeof createClient>, departureId: string) {
  const { data: departure, error } = await supabase
    .from("departures")
    .select("id, route_id, start_date")
    .eq("id", departureId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!departure?.route_id || !departure.start_date) return null;
  const { data: etapas, error: errEtapas } = await supabase
    .from("route_stages")
    .select("day_offset")
    .eq("route_id", departure.route_id);
  if (errEtapas) throw new Error(errEtapas.message);
  const hayDiaCero = tieneDiaCero(etapas ?? []);
  const inicio: string = departure.start_date;
  return {
    departure,
    fecha: (offset: number | null | undefined) => (offset != null ? fechaDeDia(inicio, offset, hayDiaCero) : null),
  };
}

/**
 * Aplica la plantilla de la ruta del departure: crea budget_items por cada
 * route_template_items con template_kind='budget_item'. Los items tipo
 * reservation_* NO se crean acá (se crean en los pasos de reservas del wizard).
 *
 * Es idempotente: si ya hay items con la misma description+day_offset, no duplica.
 */
export async function applyRouteTemplate(
  departureId: string
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  // Devuelve el error en vez de lanzarlo: en producción Next borra el mensaje de un throw.
  try {
    const supabase = createClient();
    const { data: departure, error: errCamino } = await supabase
      .from("departures")
      .select("id, route_id, start_date")
      .eq("id", departureId)
      .maybeSingle();
    if (errCamino) return { ok: false, error: errCamino.message };
    if (!departure?.route_id) return { ok: false, error: "La salida no tiene ruta asignada" };
    if (!departure.start_date) return { ok: false, error: "La salida no tiene fecha de inicio" };
    const camino = await caminoConFechas(supabase, departureId);
    if (!camino) return { ok: false, error: "La salida no tiene ruta o fecha de inicio" };

    const { data: templates, error: errPlantilla } = await supabase
      .from("route_template_items")
      .select("*")
      .eq("route_id", departure.route_id)
      .eq("template_kind", "budget_item")
      .order("position", { ascending: true });
    if (errPlantilla) return { ok: false, error: errPlantilla.message };

    if (!templates || templates.length === 0) return { ok: true, created: 0 };

    // Items ya existentes en el departure para evitar duplicar
    const { data: existing, error: errExistentes } = await supabase
      .from("budget_items")
      .select("description, item_date")
      .eq("departure_id", departureId);
    if (errExistentes) return { ok: false, error: errExistentes.message };
    const existingKeys = new Set(
      (existing ?? []).map((i: any) => `${i.description}|${i.item_date ?? ""}`)
    );

    // El CHECK de budget_items solo acepta los valores de BUDGET_STATUSES: el tipo lo frena.
    const estadoInicial: BudgetStatus = "presupuestado";
    const toInsert: any[] = [];
    for (const t of templates) {
      const itemDate = camino.fecha(t.day_offset);
      const key = `${t.description}|${itemDate ?? ""}`;
      if (existingKeys.has(key)) continue;
      toInsert.push({
        departure_id: departureId,
        category: t.category,
        description: t.description,
        quantity: t.default_quantity ?? 1,
        unit: t.unit ?? null,
        estimated_unit_cost_eur: t.default_unit_cost_eur ?? 0,
        provider_id: null,
        scaling: t.scaling,
        item_date: itemDate,
        status: estadoInicial,
        notes: t.notes ?? null,
        position: t.position ?? 0,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("budget_items").insert(toInsert);
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath(`/caminos/${departureId}`);
    revalidatePath(`/caminos/${departureId}/wizard`);
    return { ok: true, created: toInsert.length };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo aplicar la plantilla" };
  }
}

/**
 * Devuelve la lista de días esperados para el departure, combinando
 * route_stages + start_date. Incluye fecha real, day_offset, day_kind y descripción.
 */
export async function getDeparturesDays(departureId: string) {
  const supabase = createClient();
  const { data: departure } = await supabase
    .from("departures")
    .select("id, route_id, start_date")
    .eq("id", departureId)
    .maybeSingle();
  if (!departure || !departure.start_date || !departure.route_id) return [];

  const { data: stages } = await supabase
    .from("route_stages")
    .select("*")
    .eq("route_id", departure.route_id)
    .order("day_offset", { ascending: true });

  const hayDiaCero = tieneDiaCero(stages ?? []);
  return (stages ?? []).map((s: any) => ({
    day_offset: s.day_offset,
    day_kind: s.day_kind,
    from_place: s.from_place,
    to_place: s.to_place,
    km: s.km,
    description: s.description,
    date: fechaDeDia(departure.start_date!, s.day_offset, hayDiaCero),
  }));
}

/** Los items de plantilla de un tipo, con su fecha real en este camino. */
async function slotsDePlantilla(departureId: string, kind: string) {
  const supabase = createClient();
  const camino = await caminoConFechas(supabase, departureId);
  if (!camino) return [];

  const { data: items } = await supabase
    .from("route_template_items")
    .select("*")
    .eq("route_id", camino.departure.route_id)
    .eq("template_kind", kind)
    .order("day_offset", { ascending: true });

  return (items ?? []).map((t: any) => ({
    template_id: t.id,
    description: t.description,
    day_offset: t.day_offset,
    date: camino.fecha(t.day_offset),
    notes: t.notes,
  }));
}

/**
 * Para el paso 2 (alojamientos): lista de noches esperadas según la plantilla.
 * Cada noche es un template_item con template_kind='reservation_alojamiento'.
 */
export async function getAlojamientoSlots(departureId: string) {
  return slotsDePlantilla(departureId, "reservation_alojamiento");
}

export async function getTransporteSlots(departureId: string) {
  return slotsDePlantilla(departureId, "reservation_transporte");
}

export async function getCenaSlots(departureId: string) {
  return slotsDePlantilla(departureId, "reservation_cena");
}
