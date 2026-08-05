"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { assertGlobal66Rate } from "@/lib/global66";

export async function createExpense(formData: FormData) {
  const supabase = createClient();
  const currency = (formData.get("currency")?.toString() || "COP") as "EUR" | "COP" | "USD";
  const usdRate = formData.get("usd_eur_rate") ? Number(formData.get("usd_eur_rate")) : null;
  if (currency === "USD" && (!usdRate || usdRate <= 0)) {
    throw new Error("Para gastos en USD indicá la tasa USD→EUR (ej. 0.92).");
  }
  const payload = {
    expense_date: formData.get("expense_date")?.toString() || new Date().toISOString().slice(0, 10),
    kind: (formData.get("kind")?.toString() || "operativo") as "operativo" | "personal",
    category: formData.get("category")?.toString() || "Otro",
    description: formData.get("description")?.toString() || null,
    amount: Number(formData.get("amount") || 0),
    currency,
    trm_eur_cop: formData.get("trm_eur_cop") ? Number(formData.get("trm_eur_cop")) : null,
    usd_eur_rate: usdRate,
    departure_id: formData.get("departure_id")?.toString() || null,
    provider_id: formData.get("provider_id")?.toString() || null,
    budget_item_id: formData.get("budget_item_id")?.toString() || null,
    payment_method: formData.get("payment_method")?.toString() || null,
    account: formData.get("account")?.toString() || null,
    notes: formData.get("notes")?.toString() || null,
  };
  assertGlobal66Rate(payload.payment_method, payload.currency, payload.trm_eur_cop);
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
  assertGlobal66Rate(payload.payment_method, payload.currency, payload.trm_eur_cop);
  const { error } = await supabase.from("expenses").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/gastos");
  revalidatePath("/dashboard/naty");
}
