"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createBudgetItem(formData: FormData) {
  const supabase = createClient();
  const departure_id = formData.get("departure_id")?.toString() || "";
  const payload = {
    departure_id,
    category: formData.get("category")?.toString() || "Otro",
    description: formData.get("description")?.toString() || "",
    quantity: Number(formData.get("quantity") || 1),
    unit: formData.get("unit")?.toString() || null,
    estimated_unit_cost_eur: Number(formData.get("estimated_unit_cost_eur") || 0),
    confirmed_unit_cost_eur: formData.get("confirmed_unit_cost_eur")
      ? Number(formData.get("confirmed_unit_cost_eur"))
      : null,
    provider_id: formData.get("provider_id")?.toString() || null,
    status: formData.get("status")?.toString() || "presupuestado",
    scaling: formData.get("scaling")?.toString() || "por_inscrito",
    item_date: formData.get("item_date")?.toString() || null,
    notes: formData.get("notes")?.toString() || null,
  };
  const { error } = await supabase.from("budget_items").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath(`/caminos/${departure_id}`);
}

export async function updateBudgetItem(id: string, payload: any, departure_id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("budget_items").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/caminos/${departure_id}`);
}

export async function deleteBudgetItem(id: string, departure_id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("budget_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/caminos/${departure_id}`);
}
