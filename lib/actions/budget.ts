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

/**
 * Marca un item del presupuesto como pagado registrando el pago REAL en la fuente
 * única de movimientos: provider_payments si el item tiene proveedor, expenses
 * (operativo) si no. Así el dashboard, gastos y saldos por cuenta quedan cuadrados.
 */
export async function payBudgetItem(itemId: string, pago: {
  paid_at: string;
  amount: number;
  currency: "EUR" | "COP" | "USD";
  trm_eur_cop: number | null;
  usd_eur_rate: number | null;
  method: string | null;
  account: string | null;
  notes: string | null;
}) {
  const supabase = createClient();
  if (pago.currency === "USD" && (!pago.usd_eur_rate || pago.usd_eur_rate <= 0)) {
    throw new Error("Para pagos en USD indicá la tasa USD→EUR (ej. 0.92).");
  }
  if (!pago.amount || pago.amount <= 0) throw new Error("Monto inválido.");

  const { data: item, error: itemErr } = await supabase
    .from("budget_items")
    .select("id, departure_id, category, description, provider_id, reservation_id, status")
    .eq("id", itemId)
    .single();
  if (itemErr) throw new Error(itemErr.message);

  if (item.provider_id) {
    const { error } = await supabase.from("provider_payments").insert({
      provider_id: item.provider_id,
      reservation_id: item.reservation_id ?? null,
      departure_id: item.departure_id,
      paid_at: pago.paid_at,
      amount: pago.amount,
      currency: pago.currency,
      trm_eur_cop: pago.trm_eur_cop,
      usd_eur_rate: pago.usd_eur_rate,
      method: pago.method,
      account: pago.account,
      notes: pago.notes ?? `Presupuesto: ${item.description}`,
    });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("expenses").insert({
      expense_date: pago.paid_at,
      kind: "operativo",
      category: item.category,
      description: item.description,
      amount: pago.amount,
      currency: pago.currency,
      trm_eur_cop: pago.trm_eur_cop,
      usd_eur_rate: pago.usd_eur_rate,
      departure_id: item.departure_id,
      payment_method: pago.method,
      account: pago.account,
      notes: pago.notes,
    });
    if (error) throw new Error(error.message);
  }

  const { error: updErr } = await supabase.from("budget_items").update({ status: "pagado" }).eq("id", itemId);
  if (updErr) throw new Error(updErr.message);

  revalidatePath(`/caminos/${item.departure_id}`);
  revalidatePath("/gastos");
  revalidatePath("/dashboard/naty");
}
