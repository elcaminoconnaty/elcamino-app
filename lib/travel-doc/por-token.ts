import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarDocumentoDeViaje, type DocumentoDeViaje } from "./datos";

/**
 * Resuelve el enlace público del documento de viaje.
 *
 * El token es de 24 bytes, como el de la versión web de los correos. No caduca a propósito:
 * el peregrino lo va a abrir durante meses, y en Camino Sacro la auditoría concluyó que para
 * la documentación de viaje eso es correcto y no un descuido. Se retira desde la plataforma
 * cuando hace falta.
 */
export async function documentoPorToken(token: string): Promise<DocumentoDeViaje | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("departures")
    .select("id")
    .eq("travel_doc_token", token)
    .maybeSingle();
  if (!data) return null;
  return armarDocumentoDeViaje(data.id, { publico: true });
}
