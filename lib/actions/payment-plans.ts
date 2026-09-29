"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { hoyBogota } from "@/lib/utils";
import { intentar } from "@/lib/resultado";

export type InstallmentInput = {
  /** Id de la cuota si ya existía: con él se conservan su fecha de pago y el pago que la saldó. */
  id?: string;
  label?: string | null;
  due_date: string;
  amount_eur: number;
  status?: string;
  notes?: string | null;
};

/**
 * Reemplaza el plan de pagos de la inscripción. No hay transacción (queda pendiente como
 * RPC), así que se lee el plan anterior primero y, si el insert falla después del borrado,
 * se vuelve a poner el anterior: nunca queda el plan vacío en silencio.
 */
export async function setPaymentPlan(registrationId: string, installments: InstallmentInput[]) {
  return intentar(async () => {
    const supabase = createClient();
    const { data: anterior, error: errLeer } = await supabase
      .from("payment_plan_installments")
      .select("*")
      .eq("registration_id", registrationId);
    if (errLeer) throw new Error(errLeer.message);
    const porId = new Map((anterior ?? []).map((a: any) => [a.id, a]));

    const { error: errBorrar } = await supabase.from("payment_plan_installments").delete().eq("registration_id", registrationId);
    if (errBorrar) throw new Error(errBorrar.message);

    if (installments.length > 0) {
      const rows = installments.map((i, idx) => {
        const previa: any = i.id ? porId.get(i.id) : null;
        return {
          registration_id: registrationId,
          position: idx + 1,
          label: i.label ?? null,
          due_date: i.due_date,
          amount_eur: i.amount_eur,
          status: i.status ?? "pendiente",
          notes: i.notes ?? null,
          // El editor no manda cuándo ni con qué pago se saldó la cuota: se conserva.
          paid_at: previa?.paid_at ?? null,
          paid_payment_id: previa?.paid_payment_id ?? null,
        };
      });
      const { error } = await supabase.from("payment_plan_installments").insert(rows);
      if (error) {
        if (anterior?.length) await supabase.from("payment_plan_installments").insert(anterior);
        throw new Error(`No se pudo guardar el plan (quedó el anterior): ${error.message}`);
      }
    }
    revalidatePath("/peregrinos");
    revalidatePath("/dashboard/naty");
  });
}

export async function markInstallmentPaid(installmentId: string, paymentId: string | null = null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("payment_plan_installments")
    .update({ status: "pagada", paid_at: hoyBogota(), paid_payment_id: paymentId })
    .eq("id", installmentId);
  if (error) throw new Error(error.message);
  revalidatePath("/peregrinos");
  revalidatePath("/dashboard/naty");
}

export async function getInstallments(registrationId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("payment_plan_installments")
    .select("*")
    .eq("registration_id", registrationId)
    .order("position", { ascending: true });
  return data ?? [];
}
