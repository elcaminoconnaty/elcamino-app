"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function setTrm(date: string, eur_cop: number, notes?: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("trm_rates")
    .upsert({ date, eur_cop, notes: notes ?? null }, { onConflict: "date" });
  if (error) throw new Error(error.message);
  revalidatePath("/trm");
}

export async function deleteTrm(date: string) {
  const supabase = createClient();
  const { error } = await supabase.from("trm_rates").delete().eq("date", date);
  if (error) throw new Error(error.message);
  revalidatePath("/trm");
}
