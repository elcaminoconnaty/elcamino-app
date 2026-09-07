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
    // Con qué documento se identifica en el contrato. En null se deduce: pasaporte si hay
    // número de pasaporte cargado.
    document_kind: formData.get("document_kind")?.toString() || null,
    // Pasaporte y sexo también se escriben a mano: hasta ahora solo los llenaba el OCR, así
    // que un peregrino que no subiera la foto dejaba el contrato bloqueado sin salida. El
    // sexo decide si el contrato dice "identificado" o "identificada".
    passport_number: formData.get("passport_number")?.toString() || null,
    sex: formData.get("sex")?.toString() || null,
    // Dirección de notificaciones de la cláusula 23. Sin esto no se puede emitir contrato.
    address: formData.get("address")?.toString() || null,
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
    // Con qué documento se identifica en el contrato. En null se deduce: pasaporte si hay
    // número de pasaporte cargado.
    document_kind: formData.get("document_kind")?.toString() || null,
    // Pasaporte y sexo también se escriben a mano: hasta ahora solo los llenaba el OCR, así
    // que un peregrino que no subiera la foto dejaba el contrato bloqueado sin salida. El
    // sexo decide si el contrato dice "identificado" o "identificada".
    passport_number: formData.get("passport_number")?.toString() || null,
    sex: formData.get("sex")?.toString() || null,
    // Dirección de notificaciones de la cláusula 23. Sin esto no se puede emitir contrato.
    address: formData.get("address")?.toString() || null,
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

export async function updateRegistrationDetails(id: string, input: {
  departure_id?: string;
  total_eur?: number;
  discount_eur?: number;
  status?: string;
  paid_in_cop_originally?: boolean;
  notes?: string | null;
}) {
  const supabase = createClient();
  const { data: before, error: beforeErr } = await supabase
    .from("registrations")
    .select("departure_id, pilgrim_id")
    .eq("id", id)
    .single();
  if (beforeErr) throw new Error(beforeErr.message);

  const { error } = await supabase.from("registrations").update(input).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("El peregrino ya está inscrito en ese camino.");
    throw new Error(error.message);
  }

  revalidatePath(`/peregrinos/${before.pilgrim_id}`);
  revalidatePath(`/caminos/${before.departure_id}`);
  if (input.departure_id && input.departure_id !== before.departure_id) {
    revalidatePath(`/caminos/${input.departure_id}`);
  }
  revalidatePath("/pagos");
  revalidatePath("/dashboard/naty");
}

export type DeletePilgrimMode = "sin_reembolso" | "reembolsado";

async function removePassportData(supabase: ReturnType<typeof createClient>, pilgrimId: string) {
  const { data: p } = await supabase
    .from("pilgrims")
    .select("passport_image_path")
    .eq("id", pilgrimId)
    .maybeSingle();
  if (p?.passport_image_path) {
    await supabase.storage.from("passports").remove([p.passport_image_path]);
  }
}

/**
 * Elimina un peregrino. Si tiene abonos hay que decidir qué pasa con ellos:
 * - "sin_reembolso": se retiró y la plata queda como ingreso del camino. La inscripción
 *   queda cancelada (con sus abonos) y el peregrino se marca como eliminado (soft delete).
 * - "reembolsado": se le devolvió la plata → se borran abonos, inscripciones y el peregrino.
 * Sin abonos no hace falta modo: se borra todo directamente.
 */
export async function deletePilgrim(id: string, mode?: DeletePilgrimMode) {
  const supabase = createClient();

  const { data: regs, error: regsErr } = await supabase
    .from("registrations")
    .select("id, departure_id")
    .eq("pilgrim_id", id);
  if (regsErr) throw new Error(regsErr.message);
  const regIds = (regs ?? []).map((r) => r.id);
  const departureIds = Array.from(new Set((regs ?? []).map((r) => r.departure_id)));

  let payments: { registration_id: string }[] = [];
  if (regIds.length) {
    const { data } = await supabase
      .from("pilgrim_payments")
      .select("registration_id")
      .in("registration_id", regIds);
    payments = data ?? [];
  }
  const hasPayments = payments.length > 0;
  if (hasPayments && !mode) {
    throw new Error("El peregrino tiene abonos: decidí si quedan como ingreso o si se reembolsaron.");
  }

  // Las cuotas del plan de pagos se borran siempre (referencian pagos y ya no aplican).
  if (regIds.length) {
    const { error } = await supabase.from("payment_plan_installments").delete().in("registration_id", regIds);
    if (error) throw new Error(error.message);
  }

  if (hasPayments && mode === "sin_reembolso") {
    const regsConAbonos = new Set(payments.map((p) => p.registration_id));
    const keepIds = regIds.filter((r) => regsConAbonos.has(r));
    const dropIds = regIds.filter((r) => !regsConAbonos.has(r));

    const { error: updErr } = await supabase
      .from("registrations")
      .update({ status: "cancelado", refund_status: "sin_reembolso" })
      .in("id", keepIds);
    if (updErr) throw new Error(updErr.message);

    if (dropIds.length) {
      const { error } = await supabase.from("registrations").delete().in("id", dropIds);
      if (error) throw new Error(error.message);
    }

    await removePassportData(supabase, id);
    const { error: softErr } = await supabase
      .from("pilgrims")
      .update({
        deleted_at: new Date().toISOString(),
        passport_image_path: null,
        passport_extracted_at: null,
      })
      .eq("id", id);
    if (softErr) throw new Error(softErr.message);
  } else {
    // Reembolsado (o sin abonos): eliminar todo rastro financiero y personal.
    if (regIds.length) {
      if (hasPayments) {
        const { error } = await supabase.from("pilgrim_payments").delete().in("registration_id", regIds);
        if (error) throw new Error(error.message);
      }
      const { error } = await supabase.from("registrations").delete().in("id", regIds);
      if (error) throw new Error(error.message);
    }
    await removePassportData(supabase, id);
    const { error } = await supabase.from("pilgrims").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/peregrinos");
  revalidatePath("/pagos");
  revalidatePath("/dashboard/naty");
  for (const d of departureIds) revalidatePath(`/caminos/${d}`);
}
