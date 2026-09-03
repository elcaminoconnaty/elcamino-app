"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createDeparture(formData: FormData) {
  const supabase = createClient();
  const route_id = formData.get("route_id")?.toString() || null;
  const name = formData.get("name")?.toString() || "";
  const start_date = formData.get("start_date")?.toString() || null;
  const end_date = formData.get("end_date")?.toString() || null;
  const capacity = Number(formData.get("capacity") || 0) || null;
  const base_price_eur = Number(formData.get("base_price_eur") || 0);
  const status = formData.get("status")?.toString() || "planning";
  const notes = formData.get("notes")?.toString() || null;

  const { data, error } = await supabase
    .from("departures")
    .insert({ route_id, name, start_date, end_date, capacity, base_price_eur, status, notes })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/caminos");
  redirect(`/caminos/${data.id}`);
}

export async function updateDeparture(id: string, formData: FormData) {
  const supabase = createClient();
  const payload: any = {
    name: formData.get("name")?.toString(),
    start_date: formData.get("start_date")?.toString() || null,
    end_date: formData.get("end_date")?.toString() || null,
    capacity: Number(formData.get("capacity") || 0) || null,
    base_price_eur: Number(formData.get("base_price_eur") || 0),
    status: formData.get("status")?.toString(),
    notes: formData.get("notes")?.toString() || null,
    route_id: formData.get("route_id")?.toString() || null,
  };
  // El % de contingencia solo se edita desde el wizard; otros formularios no lo tocan.
  if (formData.has("variable_buffer_pct")) {
    payload.variable_buffer_pct = Number(formData.get("variable_buffer_pct") || 0) || 0;
  }
  const { error } = await supabase.from("departures").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/caminos/${id}`);
  revalidatePath("/caminos");
}

export async function createRoute(formData: FormData) {
  const supabase = createClient();
  const slug = formData.get("slug")?.toString() || "";
  const name = formData.get("name")?.toString() || "";
  const description = formData.get("description")?.toString() || null;
  const days = Number(formData.get("days") || 0) || null;
  const nights = Number(formData.get("nights") || 0) || null;
  const km = Number(formData.get("km") || 0) || null;
  const { error } = await supabase.from("routes").insert({ slug, name, description, days, nights, km });
  if (error) throw new Error(error.message);
  revalidatePath("/configuracion");
  revalidatePath("/caminos/nuevo");
}
