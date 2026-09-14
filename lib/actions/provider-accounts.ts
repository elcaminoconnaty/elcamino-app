"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { normalizarIban, validarIban, validarSwift } from "@/lib/banco";

export type CuentaInput = {
  alias: string | null;
  method: string;
  currency: string;
  fx_per_eur: number | null;
  bank_name: string | null;
  account_holder: string | null;
  iban: string | null;
  swift_bic: string | null;
  bizum_phone: string | null;
  notes: string | null;
  is_default: boolean;
};

function limpiar(fd: FormData, campo: string): string | null {
  const v = fd.get(campo)?.toString().trim();
  return v ? v : null;
}

/**
 * Lo que no se puede guardar mal: un IBAN con un dígito cambiado o un Bizum vacío se
 * descubren acá y no en el banco con el proveedor esperando la plata.
 */
function armarCuenta(fd: FormData): CuentaInput {
  const method = fd.get("method")?.toString() || "transferencia";
  const iban = normalizarIban(limpiar(fd, "iban")) || null;
  const swift = limpiar(fd, "swift_bic")?.toUpperCase().replace(/\s/g, "") ?? null;
  const currency = fd.get("currency")?.toString() || "EUR";
  const fxRaw = limpiar(fd, "fx_per_eur");

  const errIban = validarIban(iban);
  if (errIban) throw new Error(errIban);
  const errSwift = validarSwift(swift);
  if (errSwift) throw new Error(errSwift);

  const holder = limpiar(fd, "account_holder");
  if (method === "transferencia") {
    if (!iban) throw new Error("Una cuenta de transferencia necesita el IBAN.");
    if (!holder) throw new Error("Falta el titular de la cuenta: el banco lo pide para girar.");
  }
  if (method === "bizum" && !limpiar(fd, "bizum_phone")) {
    throw new Error("Para pagar por Bizum hace falta el teléfono.");
  }
  if (currency !== "EUR" && fxRaw && !(Number(fxRaw) > 0)) {
    throw new Error("La tasa de cambio tiene que ser un número mayor que cero.");
  }

  return {
    alias: limpiar(fd, "alias"),
    method,
    currency,
    fx_per_eur: currency !== "EUR" && fxRaw ? Number(fxRaw) : null,
    bank_name: limpiar(fd, "bank_name"),
    account_holder: holder,
    iban,
    swift_bic: swift,
    bizum_phone: limpiar(fd, "bizum_phone"),
    notes: limpiar(fd, "notes"),
    is_default: fd.get("is_default") === "on" || fd.get("is_default") === "true",
  };
}

/** El índice único de la BD deja una sola predeterminada por proveedor: hay que bajar la otra antes. */
async function bajarPredeterminada(supabase: any, providerId: string, exceptoId?: string) {
  let q = supabase.from("provider_payment_accounts").update({ is_default: false }).eq("provider_id", providerId).eq("is_default", true);
  if (exceptoId) q = q.neq("id", exceptoId);
  await q;
}

function revalidar(providerId: string, departureId?: string | null) {
  revalidatePath(`/proveedores/${providerId}`);
  revalidatePath("/pagos-proveedores");
  if (departureId) revalidatePath(`/caminos/${departureId}`);
}

export async function listProviderAccounts(providerId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("provider_payment_accounts")
    .select("*")
    .eq("provider_id", providerId)
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createProviderAccount(providerId: string, fd: FormData, departureId?: string | null) {
  const supabase = createClient();
  const cuenta = armarCuenta(fd);
  if (cuenta.is_default) await bajarPredeterminada(supabase, providerId);
  const { data, error } = await supabase
    .from("provider_payment_accounts")
    .insert({ ...cuenta, provider_id: providerId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  revalidar(providerId, departureId);
  return data;
}

export async function updateProviderAccount(id: string, providerId: string, fd: FormData, departureId?: string | null) {
  const supabase = createClient();
  const cuenta = armarCuenta(fd);
  if (cuenta.is_default) await bajarPredeterminada(supabase, providerId, id);
  const { error } = await supabase.from("provider_payment_accounts").update(cuenta).eq("id", id);
  if (error) throw new Error(error.message);
  revalidar(providerId, departureId);
}

/**
 * No se borra: se archiva. Las reservas viejas siguen apuntando a la cuenta con la que
 * se pagaron, y el informe de un camino pasado tiene que poder reconstruirse.
 */
export async function archiveProviderAccount(id: string, providerId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("provider_payment_accounts")
    .update({ active: false, is_default: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidar(providerId);
}
