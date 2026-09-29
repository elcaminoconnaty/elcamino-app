"use server";
import { intentar } from "@/lib/resultado";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { assertGlobal66Rate } from "@/lib/global66";
import { hoyBogota } from "@/lib/utils";

/** El wizard es una ruta aparte: revalidar /caminos/[id] no la alcanza. */
function revalidateDeparture(departureId?: string | null) {
  if (!departureId) return;
  revalidatePath(`/caminos/${departureId}`);
  revalidatePath(`/caminos/${departureId}/wizard`);
}

export async function createReservation(formData: FormData) {
  return intentar(async () => {
    const supabase = createClient();
    const departure_id = formData.get("departure_id")?.toString() || "";
    const payload = {
      departure_id,
      provider_id: formData.get("provider_id")?.toString() || "",
      type: formData.get("type")?.toString() || "alojamiento",
      location: formData.get("location")?.toString() || null,
      day_number: formData.get("day_number") ? Number(formData.get("day_number")) : null,
      check_in: formData.get("check_in")?.toString() || null,
      check_out: formData.get("check_out")?.toString() || null,
      beds_count: formData.get("beds_count") ? Number(formData.get("beds_count")) : null,
      accommodation_type: formData.get("accommodation_type")?.toString() || null,
      estimated_cost_eur: Number(formData.get("estimated_cost_eur") || 0),
      confirmed_cost_eur: formData.get("confirmed_cost_eur") ? Number(formData.get("confirmed_cost_eur")) : null,
      status: formData.get("status")?.toString() || "presupuestado",
      confirmation_ref: formData.get("confirmation_ref")?.toString() || null,
      meal_kind: formData.get("meal_kind")?.toString() || null,
      meal_persons: formData.get("meal_persons") ? Number(formData.get("meal_persons")) : null,
      meal_price_per_person_eur: formData.get("meal_price_per_person_eur") ? Number(formData.get("meal_price_per_person_eur")) : null,
      pricing_mode: formData.get("pricing_mode")?.toString() || "total",
      service_persons: formData.get("service_persons") ? Number(formData.get("service_persons")) : null,
      service_price_per_person_eur: formData.get("service_price_per_person_eur") ? Number(formData.get("service_price_per_person_eur")) : null,
      tourist_tax_per_person_eur: formData.get("tourist_tax_per_person_eur") ? Number(formData.get("tourist_tax_per_person_eur")) : 0,
      notes: formData.get("notes")?.toString() || null,
      // Solo las cenas piden menú; si el formulario trae el interruptor, manda él.
      menu_required: formData.has("menu_required")
        ? formData.get("menu_required") === "on" || formData.get("menu_required") === "true"
        : (formData.get("meal_kind")?.toString() || null) === "cena",
      menu_notes_pilgrim: formData.get("menu_notes_pilgrim")?.toString().trim() || null,
      // Cómo se paga esta reserva: la negociación de este camino con este proveedor.
      payment_account_id: formData.get("payment_account_id")?.toString() || null,
      payment_method: formData.get("payment_method")?.toString() || null,
      pay_from_account: formData.get("pay_from_account")?.toString() || null,
      payment_terms: formData.get("payment_terms")?.toString() || null,
      payment_reference: formData.get("payment_reference")?.toString() || null,
    };
    const { data, error } = await supabase.from("reservations").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    revalidateDeparture(departure_id);
    return data;
  });
}

export async function updateReservation(id: string, payload: any, departure_id?: string) {
  return intentar(async () => {
    const supabase = createClient();
    const { error } = await supabase.from("reservations").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
    revalidateDeparture(departure_id);
  });
}

export async function deleteReservation(id: string, departure_id?: string) {
  return intentar(async () => {
    const supabase = createClient();
    const { error } = await supabase.from("reservations").delete().eq("id", id);
    if (error) throw new Error(error.message);
    revalidateDeparture(departure_id);
  });
}

export async function deleteProviderPayment(id: string) {
  return intentar(async () => {
    const supabase = createClient();
    // Las cuotas que este pago saldaba: se leen antes, porque al borrar la FK pone
    // provider_payment_id en null y ya no se sabría cuáles eran.
    const { data: cuotas, error: errLeer } = await supabase
      .from("reservation_payment_schedule")
      .select("id")
      .eq("provider_payment_id", id);
    if (errLeer) throw new Error(errLeer.message);
    const { data: borrado, error } = await supabase
      .from("provider_payments")
      .delete()
      .eq("id", id)
      .select("departure_id, provider_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Vuelven a pendiente: si no, seguirían diciendo "pagada" sin plata detrás.
    const cuotaIds = (cuotas ?? []).map((c: any) => c.id);
    if (cuotaIds.length) {
      const { error: errCuota } = await supabase
        .from("reservation_payment_schedule")
        .update({ paid: false, paid_at: null })
        .in("id", cuotaIds);
      if (errCuota) throw new Error(`El pago se borró, pero la cuota del cronograma sigue marcada como pagada: ${errCuota.message}`);
    }
    revalidatePath("/proveedores");
    if (borrado?.provider_id) revalidatePath(`/proveedores/${borrado.provider_id}`);
    revalidatePath("/gastos");
    revalidatePath("/pagos-proveedores");
    revalidateDeparture(borrado?.departure_id);
  });
}

/**
 * Las listas de correos llegan del formulario como una línea separada por comas o saltos.
 * `alt_emails` solo sirve para encontrar el hilo de Gmail y no recibe nada; `cc_emails`
 * sí va en copia de cada envío.
 */
function listaDeCorreos(formData: FormData, campo: string): string[] {
  const crudo = formData.get(campo)?.toString() ?? "";
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const parte of crudo.split(/[,;\n]/)) {
    const dir = parte.trim();
    if (!dir) continue;
    const clave = dir.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(dir);
  }
  return salida;
}

export async function createProvider(formData: FormData) {
  return intentar(async () => {
    const supabase = createClient();
    const payload = {
      name: formData.get("name")?.toString() || "",
      type: formData.get("type")?.toString() || "otro",
      contact_name: formData.get("contact_name")?.toString() || null,
      email: formData.get("email")?.toString() || null,
      alt_emails: listaDeCorreos(formData, "alt_emails"),
      cc_emails: listaDeCorreos(formData, "cc_emails"),
      phone: formData.get("phone")?.toString() || null,
      country: formData.get("country")?.toString() || null,
      city: formData.get("city")?.toString() || null,
      notes: formData.get("notes")?.toString() || null,
    };
    const { data, error } = await supabase.from("providers").insert(payload).select().single();
    if (error) throw new Error(error.message);
    revalidatePath("/proveedores");
    return data;
  });
}

export async function updateProvider(id: string, formData: FormData) {
  return intentar(async () => {
    const supabase = createClient();
    const payload: any = {
      name: formData.get("name")?.toString(),
      type: formData.get("type")?.toString(),
      contact_name: formData.get("contact_name")?.toString() || null,
      email: formData.get("email")?.toString() || null,
      alt_emails: listaDeCorreos(formData, "alt_emails"),
      cc_emails: listaDeCorreos(formData, "cc_emails"),
      phone: formData.get("phone")?.toString() || null,
      country: formData.get("country")?.toString() || null,
      city: formData.get("city")?.toString() || null,
      notes: formData.get("notes")?.toString() || null,
      active: formData.get("active") === "on",
    };

    // Lo que sale impreso en el documento de viaje. Solo se escribe si el formulario lo trae,
    // para que un formulario que no lo muestra no lo borre.
    // Los datos bancarios ya no viven acá: cada proveedor tiene sus cuentas de cobro en
    // provider_payment_accounts, porque una sola cuenta no alcanza cuando la negociación
    // cambia de un camino a otro.
    for (const campo of [
      "address", "postal_code", "maps_url", "description", "check_in_time", "breakfast_time",
    ]) {
      if (formData.has(campo)) payload[campo] = formData.get(campo)?.toString() || null;
    }

    const { error } = await supabase.from("providers").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath(`/proveedores/${id}`);
    revalidatePath("/proveedores");
  });
}

/** La cuenta que la reserva tenía elegida, o la predeterminada del proveedor. */
async function cuentaDeLaReserva(supabase: any, reservationId: string): Promise<string | null> {
  const { data: r } = await supabase
    .from("reservations")
    .select("payment_account_id, provider_id")
    .eq("id", reservationId)
    .maybeSingle();
  if (!r) return null;
  if (r.payment_account_id) return r.payment_account_id;
  const { data: def } = await supabase
    .from("provider_payment_accounts")
    .select("id")
    .eq("provider_id", r.provider_id)
    .eq("is_default", true)
    .maybeSingle();
  return def?.id ?? null;
}

/** Copia congelada de la cuenta, para que el histórico no se reescriba solo. */
async function retratoDeCuenta(supabase: any, accountId: string) {
  const { data } = await supabase
    .from("provider_payment_accounts")
    .select("alias, method, currency, bank_name, account_holder, iban, swift_bic, bizum_phone")
    .eq("id", accountId)
    .maybeSingle();
  return data ?? null;
}

export async function createProviderPayment(formData: FormData) {
  return intentar(async () => {
    const supabase = createClient();
    const amount = Number(formData.get("amount") || 0);
    const currency = (formData.get("currency")?.toString() || "EUR") as "EUR" | "COP" | "USD";
    const trm = formData.get("trm_eur_cop") ? Number(formData.get("trm_eur_cop")) : null;
    const usdRate = formData.get("usd_eur_rate") ? Number(formData.get("usd_eur_rate")) : null;
    if (currency === "USD" && (!usdRate || usdRate <= 0)) {
      throw new Error("Para pagos en USD indicá la tasa USD→EUR (ej. 0.92).");
    }
    assertGlobal66Rate(formData.get("method")?.toString(), currency, trm);

    const reservationId = formData.get("reservation_id")?.toString() || null;
    // A qué cuenta se giró de verdad. Se copia acá porque si mañana el proveedor cambia
    // de IBAN, el recibo de este pago tiene que seguir diciendo a dónde fue la plata.
    const accountId = formData.get("payment_account_id")?.toString()
      || (reservationId ? await cuentaDeLaReserva(supabase, reservationId) : null);
    const paidTo = accountId ? await retratoDeCuenta(supabase, accountId) : null;

    // amount_eur lo calcula el trigger de la BD (fuente única de conversión)
    const payload = {
      provider_id: formData.get("provider_id")?.toString() || "",
      reservation_id: reservationId,
      payment_account_id: accountId,
      paid_to: paidTo,
      budget_item_id: formData.get("budget_item_id")?.toString() || null,
      departure_id: formData.get("departure_id")?.toString() || null,
      paid_at: formData.get("paid_at")?.toString() || hoyBogota(),
      amount,
      currency,
      trm_eur_cop: trm,
      usd_eur_rate: usdRate,
      method: formData.get("method")?.toString() || null,
      account: formData.get("account")?.toString() || null,
      reference: formData.get("reference")?.toString() || null,
      notes: formData.get("notes")?.toString() || null,
    };
    const { data: creado, error } = await supabase.from("provider_payments").insert(payload).select("id").single();
    if (error) throw new Error(error.message);

    // La cuota del cronograma se enlaza con ESTE pago (su id), no con "el último de la lista":
    // ordenada por fecha, el último no es el recién creado cuando se carga un pago atrasado.
    // Desde acá el pago YA está guardado: nada puede volver a "fallar" la acción, porque la
    // pantalla mostraría error y un reintento lo duplicaría. Lo que no salga se avisa aparte.
    const avisos: string[] = [];
    const scheduleItemId = formData.get("schedule_item_id")?.toString() || null;
    if (scheduleItemId) {
      const { error: errCuota } = await supabase
        .from("reservation_payment_schedule")
        .update({ paid: true, paid_at: payload.paid_at, provider_payment_id: creado.id })
        .eq("id", scheduleItemId);
      if (errCuota) avisos.push(`No se pudo marcar la cuota como pagada (${errCuota.message}). El pago sí quedó guardado.`);
    }

    if (payload.reservation_id) {
      const { data: res } = await supabase
        .from("v_reservation_payments")
        .select("paid_pct")
        .eq("reservation_id", payload.reservation_id)
        .maybeSingle();
      if (res && Number(res.paid_pct) >= 100) {
        const { error: errEstado } = await supabase.from("reservations").update({ status: "pagado" }).eq("id", payload.reservation_id);
        if (errEstado) avisos.push(`La reserva no se pudo pasar a "pagado" (${errEstado.message}). El pago sí quedó guardado.`);
      }
    }

    revalidatePath(`/proveedores/${payload.provider_id}`);
    revalidatePath("/gastos");
    revalidatePath("/dashboard/naty");
    revalidateDeparture(payload.departure_id);
    return { id: creado.id as string, aviso: avisos.length ? avisos.join(" ") : null };
  });
}
