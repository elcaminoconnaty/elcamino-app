"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { assertGlobal66Rate } from "@/lib/global66";

export async function createPilgrimPayment(input: {
  registration_id: string;
  paid_at: string;
  amount: number;
  currency: "EUR" | "COP" | "USD";
  trm_eur_cop: number | null;
  usd_eur_rate?: number | null;
  method: string | null;
  account?: string | null;
  reference: string | null;
  notes: string | null;
}) {
  if (input.currency === "USD" && (!input.usd_eur_rate || input.usd_eur_rate <= 0)) {
    throw new Error("Para pagos en USD indicá la tasa USD→EUR (ej. 0.92).");
  }
  assertGlobal66Rate(input.method, input.currency, input.trm_eur_cop);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pilgrim_payments")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/peregrinos");
  revalidatePath("/caminos");
  revalidatePath("/pagos");
  revalidatePath("/dashboard/naty");
  return data;
}

export async function updatePilgrimPayment(id: string, input: {
  paid_at?: string;
  /** Siempre en positivo. En una devolución se guarda con el signo negativo. */
  amount?: number;
  currency?: "EUR" | "COP" | "USD";
  trm_eur_cop?: number | null;
  usd_eur_rate?: number | null;
  method?: string | null;
  account?: string | null;
  reference?: string | null;
  notes?: string | null;
}) {
  if (input.currency === "USD" && (!input.usd_eur_rate || input.usd_eur_rate <= 0)) {
    throw new Error("Para pagos en USD indicá la tasa USD→EUR (ej. 0.92).");
  }
  if (input.currency) assertGlobal66Rate(input.method, input.currency, input.trm_eur_cop);
  const supabase = createClient();

  // Las devoluciones viven con monto negativo, así que el signo lo pone el
  // servidor según el tipo del pago y los formularios trabajan en positivo.
  const patch: typeof input = { ...input };
  if (patch.amount != null) {
    const { data: actual } = await supabase
      .from("pilgrim_payments")
      .select("kind")
      .eq("id", id)
      .maybeSingle();
    const magnitud = Math.abs(patch.amount);
    if (!magnitud) throw new Error("Monto inválido");
    patch.amount = actual?.kind === "devolucion" ? -magnitud : magnitud;
  }

  const { error } = await supabase.from("pilgrim_payments").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/peregrinos");
  revalidatePath("/caminos");
  revalidatePath("/pagos");
  revalidatePath("/dashboard/naty");
}

export async function deletePilgrimPayment(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("pilgrim_payments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/peregrinos");
  revalidatePath("/caminos");
  revalidatePath("/pagos");
  revalidatePath("/dashboard/naty");
}

export async function getTrmForDate(date: string): Promise<number | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("trm_rates")
    .select("eur_cop")
    .lte("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.eur_cop ?? null;
}
