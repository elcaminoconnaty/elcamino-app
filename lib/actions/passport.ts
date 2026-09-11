"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

import { extraerDatosPasaporte, camposDesdePasaporte, type PassportData } from "@/lib/passport/extraer";
export type { PassportData };

/**
 * Genera una URL firmada para que el cliente suba directo al Storage de Supabase.
 * No hay límite de payload del server action porque el archivo va directo al bucket.
 */
export async function getPassportUploadUrl(pilgrimId: string, filename: string) {
  const supabase = createClient();
  const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${pilgrimId}/${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage
    .from("passports")
    .createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/**
 * Después de subir, llama a Claude Vision con el path para extraer datos.
 */
export async function extractPassportFromStorage(pilgrimId: string, storagePath: string) {
  const supabase = createClient();
  const data = await extraerDatosPasaporte(supabase, storagePath);
  const { error: updErr } = await supabase.from("pilgrims").update(camposDesdePasaporte(data, storagePath)).eq("id", pilgrimId);
  if (updErr) throw new Error(updErr.message);
  revalidatePath(`/peregrinos/${pilgrimId}`);
  return { data, path: storagePath };
}

export async function getPassportImageUrl(pilgrimId: string): Promise<string | null> {
  const supabase = createClient();
  const { data: p } = await supabase.from("pilgrims").select("passport_image_path").eq("id", pilgrimId).maybeSingle();
  if (!p?.passport_image_path) return null;
  const { data } = await supabase.storage.from("passports").createSignedUrl(p.passport_image_path, 600);
  return data?.signedUrl ?? null;
}

/**
 * Borra todas las fotos de pasaporte de los peregrinos inscritos en una salida.
 * Pensado para usarse cuando el viaje termina (departure.status = 'finished').
 */
export async function deletePassportsForDeparture(departureId: string) {
  const supabase = createClient();
  const { data: regs } = await supabase
    .from("registrations")
    .select("pilgrim_id, pilgrims!inner(passport_image_path)")
    .eq("departure_id", departureId);

  const paths: string[] = [];
  const pilgrimIds: string[] = [];
  for (const r of (regs ?? []) as any[]) {
    if (r.pilgrims?.passport_image_path) {
      paths.push(r.pilgrims.passport_image_path);
      pilgrimIds.push(r.pilgrim_id);
    }
  }

  if (paths.length === 0) return { deleted: 0 };

  const { error: rmErr } = await supabase.storage.from("passports").remove(paths);
  if (rmErr) throw new Error(rmErr.message);

  await supabase
    .from("pilgrims")
    .update({
      passport_image_path: null,
      passport_extracted_at: null,
    })
    .in("id", pilgrimIds);

  revalidatePath("/peregrinos");
  return { deleted: paths.length };
}
