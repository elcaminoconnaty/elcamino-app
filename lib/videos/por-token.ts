import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenPlausible } from "@/lib/menus/por-token";
import { destinatarioDe } from "@/lib/bienvenida/datos";
import { urlFirmada } from "@/lib/videos/almacen";

/**
 * El video personal de un peregrino por su enlace (/video/<token>). Sin sesión: lo autoriza
 * el token de 256 bits, que es propio del video (no el del formulario), y solo devuelve lo
 * que la página muestra. Nunca se lista ni se busca otro video desde acá.
 */
export type VideoPublico = {
  id: string;
  nombre: string;
  camino: string;
  src: string;
  ancho: number;
  alto: number;
  minutos: number;
};

/** Como le dicen (el rótulo del video); si no hay, el nombre de la carta. */
const nombreDe = (f: { v: any; p: any }) => (f.v.nombre as string | null)?.trim() || destinatarioDe(f.p).nombre;

async function filaPorToken(token: string) {
  if (!tokenPlausible(token)) return null;
  const { data: v } = await createAdminClient()
    .from("pilgrim_videos")
    .select("id, storage_key, nombre, width, height, duration_s, registrations:registration_id(status, departures:departure_id(name), pilgrims:pilgrim_id(full_name, nickname, sex, deleted_at))")
    .eq("token", token)
    .maybeSingle();
  const r = (v as any)?.registrations;
  const p = r?.pilgrims;
  if (!v || !r || r.status === "cancelado" || !p || p.deleted_at) return null;
  return { v, r, p };
}

export async function videoPorToken(token: string): Promise<VideoPublico | null> {
  const f = await filaPorToken(token);
  if (!f) return null;
  return {
    id: f.v.id,
    nombre: nombreDe(f),
    camino: f.r.departures?.name ?? "",
    src: await urlFirmada(f.v.storage_key),
    ancho: f.v.width ?? 9,
    alto: f.v.height ?? 16,
    minutos: Math.max(1, Math.round(Number(f.v.duration_s ?? 60) / 60)),
  };
}

/** La URL firmada para guardar el video en el celular, con un nombre que se entienda. */
export async function descargaPorToken(token: string): Promise<string | null> {
  const f = await filaPorToken(token);
  if (!f) return null;
  return urlFirmada(f.v.storage_key, { descargarComo: `Mensaje para ${nombreDe(f)} - El Camino con Naty.mp4` });
}

/**
 * Cuenta una vista cuando le dan play, no cuando se abre la página: la vista previa de
 * WhatsApp también "abre" el enlace y se contaría sola.
 */
export async function registrarVista(token: string): Promise<void> {
  if (!tokenPlausible(token)) return;
  const db = createAdminClient();
  const { data: v } = await db.from("pilgrim_videos").select("id, view_count, first_viewed_at").eq("token", token).maybeSingle();
  if (!v) return;
  const ahora = new Date().toISOString();
  await db
    .from("pilgrim_videos")
    .update({ view_count: (v.view_count ?? 0) + 1, last_viewed_at: ahora, first_viewed_at: v.first_viewed_at ?? ahora })
    .eq("id", v.id);
}
