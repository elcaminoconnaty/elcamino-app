"use server";
import { createClient } from "@/lib/supabase/server";

export async function getReservationPayments(reservationId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("provider_payments")
    .select("*")
    .eq("reservation_id", reservationId)
    .order("paid_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}
