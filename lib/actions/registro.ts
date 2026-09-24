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

/**
 * El enlace PERSONAL del peregrino: abre directo su formulario y su carta de bienvenida,
 * sin lista de nombres. Se genera la primera vez; después siempre es el mismo.
 */
export async function obtenerEnlacesPersonales(registrationId: string): Promise<Resultado<{ formulario: string; carta: string }>> {
  const supabase = createClient();
  const { data: r, error } = await supabase.from("registrations").select("id, departure_id, pilgrim_id, form_token").eq("id", registrationId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!r) return { ok: false, error: "No encontré la inscripción." };
  let token = r.form_token as string | null;
  if (!token) {
    // Solo si sigue vacío: si dos pestañas lo piden a la vez, la segunda no pisa el enlace
    // que la primera ya pudo haber mandado por WhatsApp. Después se relee el que quedó.
    const { error: e2 } = await supabase
      .from("registrations")
      .update({ form_token: crypto.randomBytes(32).toString("hex"), form_token_created_at: new Date().toISOString() })
      .eq("id", registrationId)
      .is("form_token", null);
    if (e2) return { ok: false, error: e2.message };
    const { data: r2 } = await supabase.from("registrations").select("form_token").eq("id", registrationId).maybeSingle();
    token = (r2?.form_token as string | null) ?? null;
    if (!token) return { ok: false, error: "No se pudo generar el enlace." };
  }
  return { ok: true, formulario: `${baseUrl()}/registro/${token}`, carta: `${baseUrl()}/api/pdf/bienvenida/publico/${token}` };
}

/** Marca (o desmarca) que ya se le mandó la carta o el formulario. */
export async function marcarPasoEnviado(registrationId: string, paso: "bienvenida" | "formulario", enviado: boolean): Promise<Resultado> {
  const supabase = createClient();
  const campo = paso === "bienvenida" ? "welcome_sent_at" : "form_sent_at";
  const { data: r, error } = await supabase
    .from("registrations")
    .update({ [campo]: enviado ? new Date().toISOString() : null })
    .eq("id", registrationId)
    .select("pilgrim_id, departure_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (r) {
    revalidatePath(`/peregrinos/${r.pilgrim_id}`);
    revalidatePath(`/caminos/${r.departure_id}`);
  }
  return { ok: true };
}

/** Lo que la carta de bienvenida no puede sacar de la ruta: el punto exacto y la hora del encuentro. */
export async function guardarAjustesCarta(departureId: string, ajustes: { encuentro_lugar: string; encuentro_hora: string }): Promise<Resultado> {
  const supabase = createClient();
  const limpio = {
    encuentro_lugar: ajustes.encuentro_lugar.trim().slice(0, 120) || null,
    encuentro_hora: ajustes.encuentro_hora.trim().slice(0, 120) || null,
  };
  const { error } = await supabase.from("departures").update({ welcome_letter: limpio }).eq("id", departureId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/caminos/${departureId}`);
  return { ok: true };
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
