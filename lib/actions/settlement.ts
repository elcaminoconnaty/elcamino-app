"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { assertGlobal66Rate } from "@/lib/global66";
import { TOLERANCIA_EUR, type PilgrimSettlement, type PaymentSettlement, type SettlementMode } from "@/lib/settlement";

function revalidar() {
  revalidatePath("/peregrinos");
  revalidatePath("/caminos");
  revalidatePath("/pagos");
  revalidatePath("/dashboard/naty");
  revalidatePath("/dashboard/nico");
}

export async function getSettlement(registrationId: string): Promise<PilgrimSettlement | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("v_pilgrim_settlement")
    .select("*")
    .eq("registration_id", registrationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PilgrimSettlement) ?? null;
}

export async function getPaymentsWithSettlement(registrationId: string): Promise<PaymentSettlement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("v_pilgrim_payment_settlement")
    .select("*")
    .eq("registration_id", registrationId)
    .order("paid_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as PaymentSettlement[]) ?? [];
}

/** Tasa de cierre de toda la salida. Las inscripciones la heredan. */
export async function freezeDepartureSettlementTrm(departureId: string, trm: number, date: string) {
  if (!trm || trm <= 0) throw new Error("La tasa de cierre tiene que ser mayor que cero.");
  const supabase = createClient();
  const { error } = await supabase.rpc("freeze_departure_trm", {
    p_departure_id: departureId,
    p_trm: trm,
    p_date: date,
  });
  if (error) throw new Error(error.message);
  revalidar();
}

/** Quita la tasa de cierre del camino, para corregir una que quedó mal puesta. */
export async function clearDepartureSettlementTrm(departureId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("clear_departure_settlement_trm", {
    p_departure_id: departureId,
  });
  if (error) throw new Error(error.message);
  revalidar();
}

/**
 * Modo de liquidación del camino: con recálculo a la tasa de cierre, o sin
 * recálculo. Cambiarlo no toca ningún pago — solo cambia cómo se lee el saldo.
 */
export async function setDepartureSettlementMode(departureId: string, mode: SettlementMode) {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_departure_settlement_mode", {
    p_departure_id: departureId,
    p_mode: mode,
  });
  if (error) throw new Error(error.message);
  revalidar();
}

/**
 * Tasa de cierre pactada aparte con un peregrino. Con `trm = null` se borra y la
 * inscripción vuelve a heredar la de la salida.
 */
export async function setRegistrationSettlementTrm(registrationId: string, trm: number | null, date: string) {
  if (trm != null && trm <= 0) throw new Error("La tasa de cierre tiene que ser mayor que cero.");
  const supabase = createClient();
  const { error } = await supabase.rpc("set_registration_settlement_trm", {
    p_registration_id: registrationId,
    p_trm: trm,
    p_date: date,
  });
  if (error) throw new Error(error.message);
  revalidar();
}

/**
 * Último pago del viaje: el saldo que queda después de re-valorar todos los
 * abonos anteriores a la tasa de cierre. Se guarda como un pago normal en pesos
 * con la tasa de cierre, así que su `amount_eur` ya nace correcto y el historial
 * de los abonos anteriores queda intacto.
 */
export async function registerClosingPayment(input: {
  registration_id: string;
  paid_at: string;
  /** Monto en la divisa elegida. Siempre positivo. */
  amount: number;
  currency: "EUR" | "COP";
  /** Tasa de cierre. Obligatoria para pagos en pesos. */
  trm_eur_cop: number | null;
  method: string | null;
  account: string | null;
  reference: string | null;
  notes: string | null;
}) {
  if (!input.amount || input.amount <= 0) throw new Error("El monto del pago de cierre tiene que ser mayor que cero.");
  if (input.currency === "COP" && (!input.trm_eur_cop || input.trm_eur_cop <= 0)) {
    throw new Error("Para registrar un pago en pesos hace falta la tasa de cambio.");
  }
  assertGlobal66Rate(input.method, input.currency, input.trm_eur_cop);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("pilgrim_payments")
    .insert({
      registration_id: input.registration_id,
      paid_at: input.paid_at,
      amount: input.amount,
      currency: input.currency,
      trm_eur_cop: input.currency === "COP" ? input.trm_eur_cop : null,
      method: input.method,
      account: input.account,
      reference: input.reference,
      notes: input.notes,
      kind: "cierre",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidar();
  return data;
}

/**
 * Devolución al peregrino que pagó de más. Se guarda con monto negativo para que
 * sea un movimiento real de plata que sale: baja el saldo de la cuenta y el
 * recaudo, igual que cualquier otro egreso.
 */
export async function registerRefund(input: {
  registration_id: string;
  paid_at: string;
  /** Monto a devolver, en positivo. Se guarda negativo. */
  amount: number;
  currency: "EUR" | "COP";
  trm_eur_cop: number | null;
  method: string | null;
  account: string | null;
  reference: string | null;
  notes: string | null;
}) {
  if (!input.amount || input.amount <= 0) throw new Error("El monto a devolver tiene que ser mayor que cero.");
  if (input.currency === "COP" && (!input.trm_eur_cop || input.trm_eur_cop <= 0)) {
    throw new Error("Para devolver en pesos hace falta la tasa de cambio.");
  }
  assertGlobal66Rate(input.method, input.currency, input.trm_eur_cop);

  const settlement = await getSettlement(input.registration_id);
  if (!settlement) throw new Error("No se encontró la inscripción.");

  // Devolver más de lo que sobró dejaría el saldo del peregrino en rojo sin que
  // nadie se dé cuenta, así que se corta acá.
  const eurADevolver =
    input.currency === "COP" ? input.amount / (input.trm_eur_cop as number) : input.amount;
  const disponible = settlement.por_devolver_eur + TOLERANCIA_EUR;
  if (eurADevolver > disponible) {
    throw new Error(
      `Solo hay ${settlement.por_devolver_eur.toFixed(2)} € a favor de ${settlement.pilgrim_name}. ` +
        `Estás intentando devolver ${eurADevolver.toFixed(2)} €.`
    );
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("pilgrim_payments")
    .insert({
      registration_id: input.registration_id,
      paid_at: input.paid_at,
      amount: -Math.abs(input.amount),
      currency: input.currency,
      trm_eur_cop: input.currency === "COP" ? input.trm_eur_cop : null,
      method: input.method,
      account: input.account,
      reference: input.reference,
      notes: input.notes,
      kind: "devolucion",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidar();
  return data;
}
