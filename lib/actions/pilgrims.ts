"use server";
import { intentar } from "@/lib/resultado";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizarCelular } from "@/lib/telefono";

export async function createPilgrim(formData: FormData) {
  return intentar(async () => {
    const supabase = createClient();
    const payload = {
      full_name: formData.get("full_name")?.toString() || "",
      email: formData.get("email")?.toString() || null,
      phone: normalizarCelular(formData.get("phone")?.toString()),
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
    // Lo del formulario de inscripción: solo se escribe si el formulario lo trae, para que
    // una pantalla que no lo muestra no lo borre.
    for (const campo of ["nickname", "instagram", "emergency_contact_relation", "shirt_size"]) {
      if (formData.has(campo)) (payload as any)[campo] = formData.get(campo)?.toString().trim() || null;
    }
    if (formData.has("sandal_size")) (payload as any).sandal_size = formData.get("sandal_size") ? Number(formData.get("sandal_size")) : null;
    const { data, error } = await supabase.from("pilgrims").insert(payload).select().single();
    if (error) throw new Error(error.message);
    revalidatePath("/peregrinos");
    redirect(`/peregrinos/${data.id}`);
  });
}

export async function updatePilgrim(id: string, formData: FormData) {
  return intentar(async () => {
    const supabase = createClient();
    const payload: any = {
      full_name: formData.get("full_name")?.toString(),
      email: formData.get("email")?.toString() || null,
      phone: normalizarCelular(formData.get("phone")?.toString()),
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
    // Lo del formulario de inscripción: solo se escribe si el formulario lo trae, para que
    // una pantalla que no lo muestra no lo borre.
    for (const campo of ["nickname", "instagram", "emergency_contact_relation", "shirt_size"]) {
      if (formData.has(campo)) (payload as any)[campo] = formData.get(campo)?.toString().trim() || null;
    }
    if (formData.has("sandal_size")) (payload as any).sandal_size = formData.get("sandal_size") ? Number(formData.get("sandal_size")) : null;
    const { error } = await supabase.from("pilgrims").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath(`/peregrinos/${id}`);
    // El nombre también sale en el menú lateral (layout), en la ficha del camino y en /pagos.
    revalidatePath("/", "layout");
  });
}

export async function createRegistration(input: {
  pilgrim_id: string;
  departure_id: string;
  total_eur: number;
  paid_in_cop_originally: boolean;
  status?: string;
  notes?: string | null;
}) {
  return intentar(async () => {
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
  });
}

export async function updateRegistrationDetails(id: string, input: {
  departure_id?: string;
  total_eur?: number;
  discount_eur?: number;
  status?: string;
  paid_in_cop_originally?: boolean;
  notes?: string | null;
}) {
  return intentar(async () => {
    // La penalidad no se toca desde acá: vive como movimiento negativo entre los
    // pagos (`createPenaltyMovement`), no como un recargo sobre el precio.
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
  });
}

export type DeletePilgrimMode = "sin_reembolso" | "reembolsado";

async function removePassportData(supabase: ReturnType<typeof createClient>, pilgrimId: string) {
  const { data: p, error } = await supabase
    .from("pilgrims")
    .select("passport_image_path")
    .eq("id", pilgrimId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (p?.passport_image_path) {
    // Si el archivo no se puede borrar del bucket no se frena la eliminación: la ruta se
    // limpia de la ficha igual y el archivo huérfano no expone nada (el bucket es privado).
    await supabase.storage.from("passports").remove([p.passport_image_path]);
  }
}

/**
 * Elimina un peregrino. Si tiene abonos hay que decidir qué pasa con ellos:
 * - "sin_reembolso": se retiró y la plata queda como ingreso del camino. La inscripción
 *   queda cancelada (con sus abonos) y el peregrino se marca como eliminado (soft delete).
 * - "reembolsado": se le devolvió la plata → se borran abonos, inscripciones y el peregrino.
 * Sin abonos no hace falta modo: se borra todo directamente.
 *
 * Regla de seguridad: `pilgrim_payments.registration_id` es ON DELETE CASCADE, así que
 * borrar una inscripción borra sus abonos. Por eso ninguna inscripción con abonos se borra
 * salvo en el camino explícito "reembolsado", y si cualquier consulta falla se aborta antes
 * de tocar nada. No es una transacción (eso queda en la RPC `eliminar_peregrino` de
 * scripts/sql/20261003_fuente_unica_pendiente.sql): todo lo que puede fallar se revisa primero.
 */
export async function deletePilgrim(id: string, mode?: DeletePilgrimMode) {
  return intentar(async () => {
    const supabase = createClient();

    const { data: regs, error: regsErr } = await supabase
      .from("registrations")
      .select("id, departure_id")
      .eq("pilgrim_id", id);
    if (regsErr) throw new Error(`No se pudo revisar las inscripciones: ${regsErr.message}`);
    const regIds = (regs ?? []).map((r) => r.id);
    const departureIds = Array.from(new Set((regs ?? []).map((r) => r.departure_id)));

    let payments: { registration_id: string }[] = [];
    if (regIds.length) {
      // Una penalidad no es plata que entró, así que no cuenta para decidir qué
      // pasa con los abonos al eliminar al peregrino.
      const { data, error } = await supabase
        .from("pilgrim_payments")
        .select("registration_id")
        .in("registration_id", regIds)
        .neq("kind", "penalidad");
      // Nunca seguir sin saber si hay abonos: con el error ignorado se entraba a la rama
      // "sin abonos" y la cascada se llevaba la plata.
      if (error) throw new Error(`No se pudo revisar los abonos del peregrino; no se borró nada. (${error.message})`);
      payments = data ?? [];
    }
    const hasPayments = payments.length > 0;
    if (hasPayments && !mode) {
      throw new Error("El peregrino tiene abonos: decidí si quedan como ingreso o si se reembolsaron.");
    }
    const regsConAbonos = new Set(payments.map((p) => p.registration_id));
    const borraAbonos = hasPayments && mode === "reembolsado";
    // Las inscripciones que se van a borrar de verdad (el resto se cancela y se conserva).
    const dropIds = borraAbonos ? regIds : regIds.filter((r) => !regsConAbonos.has(r));

    // contracts.registration_id es RESTRICT: si una inscripción a borrar tiene contrato, el
    // borrado fallaría a mitad de camino (con las cuotas ya borradas). Se revisa antes.
    if (dropIds.length) {
      const { count, error } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .in("registration_id", dropIds);
      if (error) throw new Error(`No se pudo revisar los contratos; no se borró nada. (${error.message})`);
      if ((count ?? 0) > 0) {
        throw new Error(
          "El peregrino tiene un contrato emitido: no se puede borrar del todo. Retíralo del camino (queda cancelado) en vez de eliminarlo."
        );
      }
    }

    // Las cuotas del plan de pagos se borran siempre (referencian pagos y ya no aplican).
    if (regIds.length) {
      const { error } = await supabase.from("payment_plan_installments").delete().in("registration_id", regIds);
      if (error) throw new Error(error.message);
    }

    if (hasPayments && mode === "sin_reembolso") {
      const keepIds = regIds.filter((r) => regsConAbonos.has(r));

      const { error: updErr } = await supabase
        .from("registrations")
        .update({ status: "cancelado", refund_status: "sin_reembolso" })
        .in("id", keepIds);
      if (updErr) throw new Error(updErr.message);

      if (dropIds.length) {
        // Antes de borrar, confirmar que siguen sin abonos (alguien pudo registrar uno recién).
        await asegurarSinAbonos(supabase, dropIds);
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
      // Reembolsado (explícito) o sin abonos: eliminar todo rastro financiero y personal.
      if (regIds.length) {
        if (borraAbonos) {
          const { error } = await supabase.from("pilgrim_payments").delete().in("registration_id", regIds);
          if (error) throw new Error(error.message);
        } else {
          // Sin modo "reembolsado" la cascada no puede llevarse ningún abono.
          await asegurarSinAbonos(supabase, regIds);
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
  });
}

/** Aborta si alguna de estas inscripciones tiene abonos (lo que no sea penalidad). */
async function asegurarSinAbonos(supabase: ReturnType<typeof createClient>, regIds: string[]) {
  const { count, error } = await supabase
    .from("pilgrim_payments")
    .select("id", { count: "exact", head: true })
    .in("registration_id", regIds)
    .neq("kind", "penalidad");
  if (error) throw new Error(`No se pudo revisar los abonos; no se borró la inscripción. (${error.message})`);
  if ((count ?? 0) > 0) {
    throw new Error("Apareció un abono mientras se eliminaba: vuelve a abrir la ficha y decide qué hacer con él.");
  }
}
