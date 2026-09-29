"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Resultado } from "@/lib/actions/registro";

/** Marca (o desmarca) que ya se le mandó el enlace de su video. */
export async function marcarVideoEnviado(videoId: string, enviado: boolean): Promise<Resultado> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pilgrim_videos")
    .update({ sent_at: enviado ? new Date().toISOString() : null })
    .eq("id", videoId)
    .select("registrations:registration_id(departure_id)")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const dep = (data as any)?.registrations?.departure_id;
  if (dep) revalidatePath(`/caminos/${dep}`);
  return { ok: true };
}
