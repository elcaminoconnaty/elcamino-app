"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
    notes: formData.get("notes")?.toString() || null,
  };
  const { error } = await supabase.from("reservations").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath(`/caminos/${departure_id}`);
}

export async function updateReservation(id: string, payload: any, departure_id?: string) {
  const supabase = createClient();
  const { error } = await supabase.from("reservations").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  if (departure_id) revalidatePath(`/caminos/${departure_id}`);
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
  const { error } = await supabase.from("providers").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/proveedores/${id}`);
  revalidatePath("/proveedores");
}

export async function createProviderPayment(formData: FormData) {
  const supabase = createClient();
  const payload = {
    provider_id: formData.get("provider_id")?.toString() || "",
    reservation_id: formData.get("reservation_id")?.toString() || null,
    departure_id: formData.get("departure_id")?.toString() || null,
    paid_at: formData.get("paid_at")?.toString() || new Date().toISOString().slice(0, 10),
    amount: Number(formData.get("amount") || 0),
    currency: (formData.get("currency")?.toString() || "EUR") as "EUR" | "COP" | "USD",
    trm_eur_cop: formData.get("trm_eur_cop") ? Number(formData.get("trm_eur_cop")) : null,
    method: formData.get("method")?.toString() || null,
    reference: formData.get("reference")?.toString() || null,
    notes: formData.get("notes")?.toString() || null,
  };
  const { error } = await supabase.from("provider_payments").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath(`/proveedores/${payload.provider_id}`);
  if (payload.departure_id) revalidatePath(`/caminos/${payload.departure_id}`);
}
