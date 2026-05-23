"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createExpense(formData: FormData) {
  const supabase = createClient();
  const payload = {
    expense_date: formData.get("expense_date")?.toString() || new Date().toISOString().slice(0, 10),
    kind: (formData.get("kind")?.toString() || "operativo") as "operativo" | "personal",
    category: formData.get("category")?.toString() || "Otro",
    description: formData.get("description")?.toString() || null,
    amount: Number(formData.get("amount") || 0),
    currency: (formData.get("currency")?.toString() || "COP") as "EUR" | "COP" | "USD",
    trm_eur_cop: formData.get("trm_eur_cop") ? Number(formData.get("trm_eur_cop")) : null,
    departure_id: formData.get("departure_id")?.toString() || null,
    payment_method: formData.get("payment_method")?.toString() || null,
    account: formData.get("account")?.toString() || null,
    notes: formData.get("notes")?.toString() || null,
  };
  const { error } = await supabase.from("expenses").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath("/gastos");
  if (payload.departure_id) revalidatePath(`/caminos/${payload.departure_id}`);
  revalidatePath("/dashboard/naty");
}

export async function deleteExpense(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/gastos");
  revalidatePath("/dashboard/naty");
}

export async function updateExpense(id: string, payload: any) {
  const supabase = createClient();
  const { error } = await supabase.from("expenses").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/gastos");
  revalidatePath("/dashboard/naty");
}
