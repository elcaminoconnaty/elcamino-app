"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Resultado } from "@/lib/actions/registro";
import { normalizarCelular } from "@/lib/telefono";

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

/** El celular del peregrino, cargado desde la pestaña Videos para poder mandarle el enlace. */
export async function guardarCelular(pilgrimId: string, telefono: string): Promise<Resultado> {
  const limpio = telefono.trim();
  if (limpio.replace(/\D/g, "").length < 8) return { ok: false, error: "Ese número está muy corto." };
  const supabase = createClient();
  const { error } = await supabase.from("pilgrims").update({ phone: normalizarCelular(limpio) }).eq("id", pilgrimId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/peregrinos/${pilgrimId}`);
  return { ok: true };
}
