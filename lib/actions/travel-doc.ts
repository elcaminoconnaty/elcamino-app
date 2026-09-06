"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { armarDocumentoDeViaje } from "@/lib/travel-doc/datos";
import { enviarCorreo, avisoInterno } from "@/lib/email/send";
import { correoDocumentoDeViaje } from "@/lib/email/templates";

/**
 * El documento de viaje: publicar, editar la portada y enviarlo al grupo.
 *
 * A diferencia del contrato, este documento **no se congela**: el enlace sirve toda la
 * preparación del viaje y tiene que mostrar siempre la última versión. Si Naty corrige la
 * hora del desayuno tres semanas antes de salir, el peregrino la ve sin que nadie reenvíe
 * nada. Por eso la página pública arma el documento al vuelo en vez de guardar una copia.
 */

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Publica el documento: le da su enlace público si aún no lo tiene. */
export async function publicarDocumentoDeViaje(departureId: string) {
  const supabase = createClient();
  const { data: dep } = await supabase
    .from("departures")
    .select("travel_doc_token")
    .eq("id", departureId)
    .single();

  let token = dep?.travel_doc_token as string | null;
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    const { error } = await supabase
      .from("departures")
      .update({ travel_doc_token: token })
      .eq("id", departureId);
    if (error) throw new Error(error.message);
  }
  revalidatePath(`/caminos/${departureId}`);
  return { url: `${baseUrl()}/viaje/${token}` };
}

/** Retira el enlace. Los que ya lo tengan dejan de poder abrirlo. */
export async function despublicarDocumentoDeViaje(departureId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("departures")
    .update({ travel_doc_token: null })
    .eq("id", departureId);
  if (error) throw new Error(error.message);
  revalidatePath(`/caminos/${departureId}`);
}

/** La portada y los textos. Todo lo demás sale de las reservas y las etapas. */
export async function guardarPortada(
  departureId: string,
  campos: { cover_photo?: string; subtitulo?: string; tagline?: string; banda?: string }
) {
  const supabase = createClient();
  const { data: dep } = await supabase
    .from("departures")
    .select("travel_doc")
    .eq("id", departureId)
    .single();

  const { error } = await supabase
    .from("departures")
    .update({ travel_doc: { ...((dep?.travel_doc as object) ?? {}), ...campos } })
    .eq("id", departureId);
  if (error) throw new Error(error.message);
  revalidatePath(`/caminos/${departureId}`);
}

/**
 * Manda el documento a los peregrinos inscritos.
 *
 * Va el enlace, no el PDF: el documento cambia durante la preparación y un adjunto queda
 * viejo el día que Naty corrige algo. El PDF se descarga desde la página, para quien lo
 * quiera llevar sin señal en Galicia.
 */
export async function enviarDocumentoAlGrupo(departureId: string, soloA?: string) {
  const supabase = createClient();

  const { url } = await publicarDocumentoDeViaje(departureId);
  const doc = await armarDocumentoDeViaje(departureId);

  const { data: inscritos } = await supabase
    .from("registrations")
    .select("id, status, pilgrims:pilgrim_id ( full_name, email, deleted_at )")
    .eq("departure_id", departureId)
    .neq("status", "cancelado");

  const destinatarios = (inscritos ?? [])
    .map((r: any) => ({ registrationId: r.id, ...r.pilgrims }))
    .filter((p: any) => p.email && !p.deleted_at)
    .filter((p: any) => !soloA || p.email === soloA);

  if (!destinatarios.length) {
    throw new Error("Ninguno de los inscritos tiene correo cargado.");
  }

  const enviados: string[] = [];
  const fallidos: Array<{ email: string; error: string }> = [];

  for (const p of destinatarios) {
    const r = await enviarCorreo({
      ...correoDocumentoDeViaje({
        nombre: p.full_name,
        camino: doc.camino,
        recorrido: doc.recorrido,
        km: doc.km,
        primeraFecha: doc.dias[0]?.fecha ?? null,
        url,
      }),
      to: p.email,
      tipo: "documento_viaje",
      templateSlug: "documento_viaje",
      registrationId: p.registrationId,
    });
    if (r.ok) enviados.push(p.email);
    else fallidos.push({ email: p.email, error: r.error });
  }

  // El aviso a Naty va aparte, para que se entere aunque falle un envío.
  await avisoInterno(
    `Documento de viaje · ${doc.camino}`,
    `Enviado a ${enviados.length} de ${destinatarios.length} peregrinos.\n${url}` +
      (fallidos.length ? `\n\nNo salió para:\n${fallidos.map((f) => `  ${f.email}: ${f.error}`).join("\n")}` : "")
  );

  revalidatePath(`/caminos/${departureId}`);
  return { enviados: enviados.length, total: destinatarios.length, fallidos };
}
