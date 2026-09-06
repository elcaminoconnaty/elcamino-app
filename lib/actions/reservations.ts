"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { assertGlobal66Rate } from "@/lib/global66";

/** El wizard es una ruta aparte: revalidar /caminos/[id] no la alcanza. */
function revalidateDeparture(departureId?: string | null) {
  if (!departureId) return;
  revalidatePath(`/caminos/${departureId}`);
  revalidatePath(`/caminos/${departureId}/wizard`);
}

export async function createReservation(formData: FormData) {
  const supabase = createClient();
  const departure_id = formData.get("departure_id")?.toString() || "";
  const payload = {
    departure_id,
    provider_id: formData.get("provider_id")?.toString() || "",
    type: formData.get("type")?.toString() || "alojamiento",
    location: formData.get("location")?.toString() || null,
    day_number: formData.get("day_number") ? Number(formData.get("day_number")) : null,
    check_in: formData.get("check_in")?.toString() || null,
    check_out: formData.get("check_out")?.toString() || null,
    beds_count: formData.get("beds_count") ? Number(formData.get("beds_count")) : null,
    accommodation_type: formData.get("accommodation_type")?.toString() || null,
    estimated_cost_eur: Number(formData.get("estimated_cost_eur") || 0),
    confirmed_cost_eur: formData.get("confirmed_cost_eur") ? Number(formData.get("confirmed_cost_eur")) : null,
    status: formData.get("status")?.toString() || "presupuestado",
    confirmation_ref: formData.get("confirmation_ref")?.toString() || null,
    meal_kind: formData.get("meal_kind")?.toString() || null,
    meal_persons: formData.get("meal_persons") ? Number(formData.get("meal_persons")) : null,
    meal_price_per_person_eur: formData.get("meal_price_per_person_eur") ? Number(formData.get("meal_price_per_person_eur")) : null,
    pricing_mode: formData.get("pricing_mode")?.toString() || "total",
    service_persons: formData.get("service_persons") ? Number(formData.get("service_persons")) : null,
    service_price_per_person_eur: formData.get("service_price_per_person_eur") ? Number(formData.get("service_price_per_person_eur")) : null,
    tourist_tax_per_person_eur: formData.get("tourist_tax_per_person_eur") ? Number(formData.get("tourist_tax_per_person_eur")) : 0,
    notes: formData.get("notes")?.toString() || null,
  };
  const { data, error } = await supabase.from("reservations").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  revalidateDeparture(departure_id);
  return data;
}

export async function updateReservation(id: string, payload: any, departure_id?: string) {
  const supabase = createClient();
  const { error } = await supabase.from("reservations").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateDeparture(departure_id);
}

export async function deleteReservation(id: string, departure_id?: string) {
  const supabase = createClient();
  const { error } = await supabase.from("reservations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateDeparture(departure_id);
}

export async function updateProviderPayment(id: string, payload: any) {
  const supabase = createClient();
  const { error } = await supabase.from("provider_payments").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/proveedores");
}

export async function deleteProviderPayment(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("provider_payments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/proveedores");
}

export async function createProvider(formData: FormData) {
  const supabase = createClient();
  const payload = {
    name: formData.get("name")?.toString() || "",
    type: formData.get("type")?.toString() || "otro",
    contact_name: formData.get("contact_name")?.toString() || null,
    email: formData.get("email")?.toString() || null,
    phone: formData.get("phone")?.toString() || null,
    country: formData.get("country")?.toString() || null,
    city: formData.get("city")?.toString() || null,
    notes: formData.get("notes")?.toString() || null,
  };
  const { data, error } = await supabase.from("providers").insert(payload).select().single();
  if (error) throw new Error(error.message);
  revalidatePath("/proveedores");
  return data;
}

export async function updateProvider(id: string, formData: FormData) {
  const supabase = createClient();
  const payload: any = {
    name: formData.get("name")?.toString(),
    type: formData.get("type")?.toString(),
    contact_name: formData.get("contact_name")?.toString() || null,
    email: formData.get("email")?.toString() || null,
    phone: formData.get("phone")?.toString() || null,
    country: formData.get("country")?.toString() || null,
    city: formData.get("city")?.toString() || null,
    notes: formData.get("notes")?.toString() || null,
    active: formData.get("active") === "on",
  };

  // Lo que sale impreso en el documento de viaje. Solo se escribe si el formulario lo trae,
  // para que un formulario que no lo muestra no lo borre.
  for (const campo of ["address", "postal_code", "maps_url", "description", "check_in_time", "breakfast_time"]) {
    if (formData.has(campo)) payload[campo] = formData.get(campo)?.toString() || null;
  }

  const { error } = await supabase.from("providers").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/proveedores/${id}`);
  revalidatePath("/proveedores");
}

export async function createProviderPayment(formData: FormData) {
  const supabase = createClient();
  const amount = Number(formData.get("amount") || 0);
  const currency = (formData.get("currency")?.toString() || "EUR") as "EUR" | "COP" | "USD";
  const trm = formData.get("trm_eur_cop") ? Number(formData.get("trm_eur_cop")) : null;
  const usdRate = formData.get("usd_eur_rate") ? Number(formData.get("usd_eur_rate")) : null;
  if (currency === "USD" && (!usdRate || usdRate <= 0)) {
    throw new Error("Para pagos en USD indicá la tasa USD→EUR (ej. 0.92).");
  }
  assertGlobal66Rate(formData.get("method")?.toString(), currency, trm);
  // amount_eur lo calcula el trigger de la BD (fuente única de conversión)
  const payload = {
    provider_id: formData.get("provider_id")?.toString() || "",
    reservation_id: formData.get("reservation_id")?.toString() || null,
    budget_item_id: formData.get("budget_item_id")?.toString() || null,
    departure_id: formData.get("departure_id")?.toString() || null,
    paid_at: formData.get("paid_at")?.toString() || new Date().toISOString().slice(0, 10),
    amount,
    currency,
    trm_eur_cop: trm,
    usd_eur_rate: usdRate,
    method: formData.get("method")?.toString() || null,
    account: formData.get("account")?.toString() || null,
    reference: formData.get("reference")?.toString() || null,
    notes: formData.get("notes")?.toString() || null,
  };
  const { error } = await supabase.from("provider_payments").insert(payload);
  if (error) throw new Error(error.message);

  if (payload.reservation_id) {
    const { data: res } = await supabase
      .from("v_reservation_payments")
      .select("paid_pct")
      .eq("reservation_id", payload.reservation_id)
      .maybeSingle();
    if (res && Number(res.paid_pct) >= 100) {
      await supabase.from("reservations").update({ status: "pagado" }).eq("id", payload.reservation_id);
    }
  }

  revalidatePath(`/proveedores/${payload.provider_id}`);
  revalidatePath("/gastos");
  revalidatePath("/dashboard/naty");
  revalidateDeparture(payload.departure_id);
}
