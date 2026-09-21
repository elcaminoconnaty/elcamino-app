"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { assertGlobal66Rate } from "@/lib/global66";
import { MOVIMIENTOS_NEGATIVOS, type PaymentKind } from "@/lib/settlement";

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

/**
 * Penalidad (p. ej. por cambiarse de grupo): no es plata que entró, es un cargo
 * pactado. Se guarda como un movimiento negativo entre los pagos, así el precio
 * del viaje queda como se cotizó y la penalidad se le resta a sus abonos. El
 * monto llega en positivo; el signo lo pone el servidor. La cuenta y el método
 * los limpia la base: una penalidad no pasa por ninguna cuenta.
 */
export async function createPenaltyMovement(input: {
  registration_id: string;
  paid_at: string;
  /** En positivo. */
  amount: number;
  currency: "EUR" | "COP";
  trm_eur_cop: number | null;
  concept: string;
  notes: string | null;
}) {
  const magnitud = Math.abs(Number(input.amount));
  if (!magnitud) throw new Error("Monto inválido");
  if (!input.concept.trim()) throw new Error("Escribí el concepto de la penalidad.");
  if (input.currency === "COP" && (!input.trm_eur_cop || input.trm_eur_cop <= 0)) {
    throw new Error("Para una penalidad en pesos indicá la tasa COP/EUR del día en que se pactó.");
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pilgrim_payments")
    .insert({
      registration_id: input.registration_id,
      paid_at: input.paid_at,
      amount: -magnitud,
      currency: input.currency,
      // En euros la tasa no convierte nada, pero queda de referencia para poder
      // decirle al peregrino cuántos pesos eran el día que se pactó.
      trm_eur_cop: input.trm_eur_cop && input.trm_eur_cop > 0 ? input.trm_eur_cop : null,
      kind: "penalidad",
      concept: input.concept.trim(),
      notes: input.notes,
    })
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
  concept?: string | null;
}) {
  if (input.currency === "USD" && (!input.usd_eur_rate || input.usd_eur_rate <= 0)) {
    throw new Error("Para pagos en USD indicá la tasa USD→EUR (ej. 0.92).");
  }
  if (input.currency) assertGlobal66Rate(input.method, input.currency, input.trm_eur_cop);
  const supabase = createClient();

  // Las devoluciones y las penalidades viven con monto negativo, así que el
  // signo lo pone el servidor según el tipo del movimiento y los formularios
  // trabajan siempre en positivo.
  const patch: typeof input = { ...input };
  if (patch.amount != null) {
    const { data: actual } = await supabase
      .from("pilgrim_payments")
      .select("kind")
      .eq("id", id)
      .maybeSingle();
    const magnitud = Math.abs(patch.amount);
    if (!magnitud) throw new Error("Monto inválido");
    patch.amount = MOVIMIENTOS_NEGATIVOS.includes(actual?.kind as PaymentKind) ? -magnitud : magnitud;
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
