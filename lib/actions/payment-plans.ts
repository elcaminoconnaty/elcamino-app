"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type InstallmentInput = {
  label?: string | null;
  due_date: string;
  amount_eur: number;
  status?: string;
  notes?: string | null;
};

export async function setPaymentPlan(registrationId: string, installments: InstallmentInput[]) {
  const supabase = createClient();
  await supabase.from("payment_plan_installments").delete().eq("registration_id", registrationId);
  if (installments.length > 0) {
    const rows = installments.map((i, idx) => ({
      registration_id: registrationId,
      position: idx + 1,
      label: i.label ?? null,
      due_date: i.due_date,
      amount_eur: i.amount_eur,
      status: i.status ?? "pendiente",
      notes: i.notes ?? null,
    }));
    const { error } = await supabase.from("payment_plan_installments").insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/peregrinos");
  revalidatePath("/dashboard/naty");
}

export async function markInstallmentPaid(installmentId: string, paymentId: string | null = null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("payment_plan_installments")
    .update({ status: "pagada", paid_at: new Date().toISOString().slice(0, 10), paid_payment_id: paymentId })
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
