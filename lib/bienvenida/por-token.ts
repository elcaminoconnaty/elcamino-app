import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenPlausible } from "@/lib/menus/por-token";
import { destinatarioDe, type Destinatario } from "@/lib/bienvenida/datos";

/**
 * La carta por el enlace personal del peregrino (el mismo token del formulario). Sin sesión:
 * se autoriza por el token de 256 bits y solo devuelve lo que la carta ya dice.
 */
export type CartaPublica = { destinatario: Destinatario; camino: string; pdf: string; formulario: string; formularioLleno: boolean };

export async function cartaPorToken(token: string): Promise<CartaPublica | null> {
  if (!tokenPlausible(token)) return null;
  const { data: r } = await createAdminClient()
    .from("registrations")
    .select("id, status, registration_form_submitted_at, departures:departure_id(name), pilgrims:pilgrim_id(full_name, nickname, sex, deleted_at)")
    .eq("form_token", token)
    .maybeSingle();
  const p = (r as any)?.pilgrims;
  if (!r || r.status === "cancelado" || !p || p.deleted_at) return null;
  return {
    destinatario: destinatarioDe(p),
    camino: (r as any).departures?.name ?? "",
    pdf: `/api/pdf/bienvenida/publico/${token}`,
    formulario: `/registro/${token}`,
    formularioLleno: !!r.registration_form_submitted_at,
  };
}
