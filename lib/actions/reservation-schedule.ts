"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ScheduleInput = {
  id?: string;
  due_date: string;
  amount_eur: number;
  label: string | null;
  notes: string | null;
  paid: boolean;
  paid_at: string | null;
  provider_payment_id: string | null;
  position: number;
};

export async function getReservationSchedule(reservationId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reservation_payment_schedule")
    .select("*")
    .eq("reservation_id", reservationId)
    .order("due_date", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setReservationSchedule(
  reservationId: string,
  items: ScheduleInput[],
  departureId?: string
) {
  const supabase = createClient();
  // Estrategia simple: borrar todo y reinsertar (preservando provider_payment_id si coincide id)
  const { data: existing } = await supabase
    .from("reservation_payment_schedule")
    .select("id, provider_payment_id, paid, paid_at")
    .eq("reservation_id", reservationId);

  const existingMap = new Map<string, any>();
  (existing ?? []).forEach((e: any) => existingMap.set(e.id, e));

  const { error: delErr } = await supabase
    .from("reservation_payment_schedule")
    .delete()
    .eq("reservation_id", reservationId);
  if (delErr) throw new Error(delErr.message);

  if (items.length > 0) {
    const payload = items.map((it, i) => {
      const prev = it.id ? existingMap.get(it.id) : null;
      return {
        reservation_id: reservationId,
        due_date: it.due_date,
        amount_eur: it.amount_eur,
        label: it.label,
        notes: it.notes,
        position: i,
        paid: prev?.paid ?? it.paid ?? false,
        paid_at: prev?.paid_at ?? it.paid_at ?? null,
        provider_payment_id: prev?.provider_payment_id ?? it.provider_payment_id ?? null,
      };
    });
    const { error: insErr } = await supabase
      .from("reservation_payment_schedule")
      .insert(payload);
    if (insErr) throw new Error(insErr.message);
  }

  if (departureId) revalidatePath(`/caminos/${departureId}`);
}

export async function markScheduleItemPaid(
  scheduleItemId: string,
  providerPaymentId: string | null,
  paidAt: string,
  departureId?: string
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservation_payment_schedule")
    .update({ paid: true, paid_at: paidAt, provider_payment_id: providerPaymentId })
    .eq("id", scheduleItemId);
  if (error) throw new Error(error.message);
  if (departureId) revalidatePath(`/caminos/${departureId}`);
}
