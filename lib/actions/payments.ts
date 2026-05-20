"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createPilgrimPayment(input: {
  registration_id: string;
  paid_at: string;
  amount: number;
  currency: "EUR" | "COP" | "USD";
  trm_eur_cop: number | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pilgrim_payments")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/peregrinos");
  return data;
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
