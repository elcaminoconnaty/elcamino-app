"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createPilgrim(formData: FormData) {
  const supabase = createClient();
  const payload = {
    full_name: formData.get("full_name")?.toString() || "",
    email: formData.get("email")?.toString() || null,
    phone: formData.get("phone")?.toString() || null,
    country: formData.get("country")?.toString() || null,
    document_id: formData.get("document_id")?.toString() || null,
    birth_date: formData.get("birth_date")?.toString() || null,
    emergency_contact_name: formData.get("emergency_contact_name")?.toString() || null,
    emergency_contact_phone: formData.get("emergency_contact_phone")?.toString() || null,
    dietary_notes: formData.get("dietary_notes")?.toString() || null,
    notes: formData.get("notes")?.toString() || null,
  };
  const { data, error } = await supabase.from("pilgrims").insert(payload).select().single();
  if (error) throw new Error(error.message);
  revalidatePath("/peregrinos");
  redirect(`/peregrinos/${data.id}`);
}

export async function updatePilgrim(id: string, formData: FormData) {
  const supabase = createClient();
  const payload: any = {
    full_name: formData.get("full_name")?.toString(),
    email: formData.get("email")?.toString() || null,
    phone: formData.get("phone")?.toString() || null,
    country: formData.get("country")?.toString() || null,
    document_id: formData.get("document_id")?.toString() || null,
    birth_date: formData.get("birth_date")?.toString() || null,
    emergency_contact_name: formData.get("emergency_contact_name")?.toString() || null,
    emergency_contact_phone: formData.get("emergency_contact_phone")?.toString() || null,
    dietary_notes: formData.get("dietary_notes")?.toString() || null,
    notes: formData.get("notes")?.toString() || null,
  };
  const { error } = await supabase.from("pilgrims").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/peregrinos/${id}`);
}

export async function createRegistration(input: {
  pilgrim_id: string;
  departure_id: string;
  total_eur: number;
  paid_in_cop_originally: boolean;
  status?: string;
  notes?: string | null;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("registrations")
    .insert({
      pilgrim_id: input.pilgrim_id,
      departure_id: input.departure_id,
      total_eur: input.total_eur,
      paid_in_cop_originally: input.paid_in_cop_originally,
      status: input.status ?? "inscrito",
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/caminos/${input.departure_id}`);
  revalidatePath(`/peregrinos/${input.pilgrim_id}`);
  return data;
}

export async function updateRegistration(id: string, payload: any) {
  const supabase = createClient();
  const { error } = await supabase.from("registrations").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}
