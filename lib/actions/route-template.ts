"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Calcula la fecha de un day_offset relativo al start_date del camino.
 * day_offset = 1 corresponde a start_date.
 */
/**
 * day_offset = 1 corresponde a start_date (primer día caminando).
 * No existe day_offset = 0 — saltamos de -1 directo a 1.
 * Ej. con start_date = 2026-09-28:
 *   day_offset -3 → 2026-09-25 (llegada Madrid)
 *   day_offset -1 → 2026-09-27 (encuentro grupo + tren Sarria)
 *   day_offset  1 → 2026-09-28 (primer caminata)
 *   day_offset  7 → 2026-10-04 (fin servicios + tren Madrid)
 */
export async function dateForOffset(startDate: string, dayOffset: number): Promise<string> {
  const [y, m, d] = startDate.split("-").map(Number);
  const base = new Date(y, m - 1, d, 12, 0, 0);
  const shift = dayOffset > 0 ? dayOffset - 1 : dayOffset;
  base.setDate(base.getDate() + shift);
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function offsetDate(startDate: string, dayOffset: number): string {
  const [y, m, d] = startDate.split("-").map(Number);
  const base = new Date(y, m - 1, d, 12, 0, 0);
  const shift = dayOffset > 0 ? dayOffset - 1 : dayOffset;
  base.setDate(base.getDate() + shift);
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Aplica la plantilla de la ruta del departure: crea budget_items por cada
 * route_template_items con template_kind='budget_item'. Los items tipo
 * reservation_* NO se crean acá (se crean en los pasos de reservas del wizard).
 *
 * Es idempotente: si ya hay items con la misma description+day_offset, no duplica.
 */
export async function applyRouteTemplate(departureId: string) {
  const supabase = createClient();
  const { data: departure } = await supabase
    .from("departures")
    .select("id, route_id, start_date")
    .eq("id", departureId)
    .maybeSingle();
  if (!departure?.route_id) throw new Error("La salida no tiene ruta asignada");
  if (!departure.start_date) throw new Error("La salida no tiene fecha de inicio");

  const { data: templates } = await supabase
    .from("route_template_items")
    .select("*")
    .eq("route_id", departure.route_id)
    .eq("template_kind", "budget_item")
    .order("position", { ascending: true });

  if (!templates || templates.length === 0) return { created: 0 };

  // Items ya existentes en el departure para evitar duplicar
  const { data: existing } = await supabase
    .from("budget_items")
    .select("description, item_date")
    .eq("departure_id", departureId);
  const existingKeys = new Set(
    (existing ?? []).map((i: any) => `${i.description}|${i.item_date ?? ""}`)
  );

  const toInsert: any[] = [];
  for (const t of templates) {
    const itemDate = t.day_offset != null ? offsetDate(departure.start_date, t.day_offset) : null;
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
      status: "estimado",
      notes: t.notes ?? null,
      position: t.position ?? 0,
    });
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("budget_items").insert(toInsert);
    if (error) throw new Error(error.message);
  }
  revalidatePath(`/caminos/${departureId}`);
  revalidatePath(`/caminos/${departureId}/wizard`);
  return { created: toInsert.length };
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

  return (stages ?? []).map((s: any) => ({
    day_offset: s.day_offset,
    day_kind: s.day_kind,
    from_place: s.from_place,
    to_place: s.to_place,
    km: s.km,
    description: s.description,
    date: offsetDate(departure.start_date!, s.day_offset),
  }));
}

/**
 * Para el paso 2 (alojamientos): lista de noches esperadas según la plantilla.
 * Cada noche es un template_item con template_kind='reservation_alojamiento'.
 */
export async function getAlojamientoSlots(departureId: string) {
  const supabase = createClient();
  const { data: departure } = await supabase
    .from("departures")
    .select("id, route_id, start_date")
    .eq("id", departureId)
    .maybeSingle();
  if (!departure?.route_id || !departure.start_date) return [];

  const { data: items } = await supabase
    .from("route_template_items")
    .select("*")
    .eq("route_id", departure.route_id)
    .eq("template_kind", "reservation_alojamiento")
    .order("day_offset", { ascending: true });

  return (items ?? []).map((t: any) => ({
    template_id: t.id,
    description: t.description,
    day_offset: t.day_offset,
    date: t.day_offset != null ? offsetDate(departure.start_date!, t.day_offset) : null,
  }));
}

export async function getTransporteSlots(departureId: string) {
  const supabase = createClient();
  const { data: departure } = await supabase
    .from("departures")
    .select("id, route_id, start_date")
    .eq("id", departureId)
    .maybeSingle();
  if (!departure?.route_id || !departure.start_date) return [];

  const { data: items } = await supabase
    .from("route_template_items")
    .select("*")
    .eq("route_id", departure.route_id)
    .eq("template_kind", "reservation_transporte")
    .order("day_offset", { ascending: true });

  return (items ?? []).map((t: any) => ({
    template_id: t.id,
    description: t.description,
    day_offset: t.day_offset,
    date: t.day_offset != null ? offsetDate(departure.start_date!, t.day_offset) : null,
    notes: t.notes,
  }));
}

export async function getCenaSlots(departureId: string) {
  const supabase = createClient();
  const { data: departure } = await supabase
    .from("departures")
    .select("id, route_id, start_date")
    .eq("id", departureId)
    .maybeSingle();
  if (!departure?.route_id || !departure.start_date) return [];

  const { data: items } = await supabase
    .from("route_template_items")
    .select("*")
    .eq("route_id", departure.route_id)
    .eq("template_kind", "reservation_cena")
    .order("day_offset", { ascending: true });

  return (items ?? []).map((t: any) => ({
    template_id: t.id,
    description: t.description,
    day_offset: t.day_offset,
    date: t.day_offset != null ? offsetDate(departure.start_date!, t.day_offset) : null,
  }));
}
