"use server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** El enlace único del formulario de inscripción del camino; se genera la primera vez. */
export async function obtenerEnlaceRegistro(departureId: string): Promise<Resultado<{ url: string }>> {
  const supabase = createClient();
  const { data: d, error } = await supabase.from("departures").select("id, registration_token").eq("id", departureId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!d) return { ok: false, error: "No encontré el camino." };
  let token = d.registration_token as string | null;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    const { error: e2 } = await supabase.from("departures").update({ registration_token: token, registration_token_created_at: new Date().toISOString() }).eq("id", departureId);
    if (e2) return { ok: false, error: e2.message };
  }
  return { ok: true, url: `${baseUrl()}/registro/${token}` };
}

/** Cambia el enlace: el anterior deja de servir. */
export async function rotarEnlaceRegistro(departureId: string): Promise<Resultado<{ url: string }>> {
  const supabase = createClient();
  const token = crypto.randomBytes(32).toString("hex");
  const { error } = await supabase.from("departures").update({ registration_token: token, registration_token_created_at: new Date().toISOString() }).eq("id", departureId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/caminos/${departureId}`);
  return { ok: true, url: `${baseUrl()}/registro/${token}` };
}

/** Acepta una solicitud: crea el peregrino con lo que mandó y lo inscribe como pre-inscrito. */
export async function aceptarSolicitud(requestId: string): Promise<Resultado<{ pilgrimId: string }>> {
  const supabase = createClient();
  const { data: s, error } = await supabase.from("registration_requests").select("*, departures(base_price_eur)").eq("id", requestId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!s) return { ok: false, error: "No encontré la solicitud." };
  if (s.status !== "pendiente") return { ok: false, error: "Esa solicitud ya se resolvió." };

  const { data: p, error: e1 } = await supabase
    .from("pilgrims")
    .insert({ full_name: s.full_name, email: s.email, phone: s.phone, country: "Colombia", notes: s.payload?.mensaje ? `Solicitud desde el formulario: ${s.payload.mensaje}` : null })
    .select("id")
    .single();
  if (e1) return { ok: false, error: e1.message };
  const { error: e2 } = await supabase.from("registrations").insert({
    pilgrim_id: p.id,
    departure_id: s.departure_id,
    total_eur: Number((s as any).departures?.base_price_eur ?? 0),
    paid_in_cop_originally: true,
    status: "pre_inscrito",
    notes: "Entró por el formulario de inscripción (solicitud).",
  });
  if (e2) return { ok: false, error: e2.message };
  await supabase.from("registration_requests").update({ status: "aceptada", pilgrim_id: p.id, resolved_at: new Date().toISOString() }).eq("id", requestId);
  revalidatePath(`/caminos/${s.departure_id}`);
  revalidatePath("/peregrinos");
  return { ok: true, pilgrimId: p.id };
}

export async function rechazarSolicitud(requestId: string): Promise<Resultado> {
  const supabase = createClient();
  const { data: s } = await supabase.from("registration_requests").select("departure_id").eq("id", requestId).maybeSingle();
  const { error } = await supabase.from("registration_requests").update({ status: "rechazada", resolved_at: new Date().toISOString() }).eq("id", requestId);
  if (error) return { ok: false, error: error.message };
  if (s?.departure_id) revalidatePath(`/caminos/${s.departure_id}`);
  return { ok: true };
}
