"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { CONTACTO } from "@/lib/brand";
import { cargarCenas, cenasDe, libroDeRestaurante, conteoPorSeccion, progresoDe, dietasDe } from "@/lib/export/cenas";
import { correoMenuRestaurante } from "@/lib/email/plantillas-proveedores";
import { enviarPorGmail, gmailNoConfigurado } from "@/lib/email/gmail";
import { enviarCorreo } from "@/lib/email/send";
import type { VistaPreviaRooming } from "@/lib/actions/rooming-email";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export type VistaPreviaMenu = VistaPreviaRooming & { pendientes: number };

async function armar(supabase: any, reservationId: string, notaExtra?: string | null) {
  const { data: r, error } = await supabase
    .from("reservations")
    .select("id, departure_id, check_in, confirmation_ref, gmail_thread_id, gmail_last_message_id, gmail_thread_subject, menu_sent_at, providers(id, name, email, contact_name)")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!r) return { ok: false as const, error: "No encontré la reserva." };

  const datos = await cargarCenas(supabase, r.departure_id);
  if (!datos) return { ok: false as const, error: "No encontré el camino." };
  const grupo = cenasDe(datos, { reservationId });
  const cena = grupo[0];
  if (!cena) return { ok: false as const, error: "Esta reserva no está marcada como cena con menú." };
  if (cena.courses.length === 0) return { ok: false as const, error: "Esta cena no tiene menú cargado todavía." };

  const progreso = progresoDe(cena);
  const correo = correoMenuRestaurante({
    contacto: r.providers?.contact_name ?? null,
    restaurante: r.providers?.name ?? "Restaurante",
    camino: datos.caminoNombre,
    fecha: formatDate(r.check_in),
    referencia: r.confirmation_ref ?? null,
    comensales: progreso.cenan,
    pendientes: progreso.pendientes,
    secciones: conteoPorSeccion(cena),
    enSitio: cena.courses.filter((c) => c.mode === "en_sitio").map((c) => c.label),
    dietas: dietasDe(cena),
    notaExtra: notaExtra ?? null,
  });
  const libro = libroDeRestaurante(datos, grupo);
  if (!libro) return { ok: false as const, error: "No se pudo armar el Excel." };
  return { ok: true as const, reservation: r, correo, libro, progreso };
}

/** Lo que se va a mandar al restaurante, para verlo antes de tocar Enviar. */
export async function previsualizarMenuRestaurante(reservationId: string, notaExtra?: string | null): Promise<Resultado<VistaPreviaMenu>> {
  const supabase = createClient();
  const a = await armar(supabase, reservationId, notaExtra);
  if (!a.ok) return a;
  const r = a.reservation;
  const sinGmail = gmailNoConfigurado();
  const to = (r.providers?.email ?? "").trim() || null;
  let aviso: string | null = null;
  if (!to) aviso = `${r.providers?.name ?? "El restaurante"} no tiene correo cargado. Ponéselo en Proveedores.`;
  else if (sinGmail) aviso = `${sinGmail} Saldría por Brevo desde reservas@, fuera del hilo.`;
  else if (!r.gmail_thread_id) aviso = "Esta reserva no tiene hilo de Gmail enlazado: saldrá como correo nuevo desde elcaminoconnaty@gmail.com. Si ya hay un hilo con el restaurante, enlazalo primero.";
  if (a.progreso.pendientes > 0) aviso = `${aviso ? `${aviso} ` : ""}Faltan ${a.progreso.pendientes} por elegir: el correo lo dice y va con lo que hay.`;
  return {
    ok: true,
    to,
    subject: r.gmail_thread_id && r.gmail_thread_subject ? `Re: ${String(r.gmail_thread_subject).replace(/^re:\s*/i, "")}` : a.correo.subject,
    html: a.correo.html,
    filename: a.libro.filename,
    hotel: r.providers?.name ?? "Restaurante",
    hilo: r.gmail_thread_id ? { threadId: r.gmail_thread_id, subject: r.gmail_thread_subject ?? null } : null,
    via: sinGmail ? "brevo" : "gmail",
    aviso,
    personas: a.progreso.cenan,
    habitaciones: 0,
    pendientes: a.progreso.pendientes,
    enviadoEl: r.menu_sent_at ?? null,
  };
}

/** Manda la elección de menú al restaurante (mismo mecanismo que el rooming list). */
export async function enviarMenuAlRestaurante(
  reservationId: string,
  opts: { copiaAMi?: boolean; notaExtra?: string | null } = {}
): Promise<Resultado<{ via: "gmail" | "brevo"; to: string }>> {
  const supabase = createClient();
  const a = await armar(supabase, reservationId, opts.notaExtra);
  if (!a.ok) return a;
  const r = a.reservation;
  const to = opts.copiaAMi ? CONTACTO.correo : ((r.providers?.email ?? "").trim() || null);
  if (!to) return { ok: false, error: `${r.providers?.name ?? "El restaurante"} no tiene correo cargado.` };
  const adjunto = { filename: a.libro.filename, content: a.libro.buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  const enHilo = !opts.copiaAMi && !!r.gmail_thread_id;
  const subject = enHilo && r.gmail_thread_subject ? `Re: ${String(r.gmail_thread_subject).replace(/^re:\s*/i, "")}` : a.correo.subject;
  const slug = opts.copiaAMi ? "menu_restaurante_prueba" : "menu_restaurante";

  if (!gmailNoConfigurado()) {
    const res = await enviarPorGmail({
      to,
      subject,
      html: a.correo.html,
      text: a.correo.text,
      tipo: "menu_restaurante",
      threadId: enHilo ? r.gmail_thread_id : null,
      inReplyToMessageId: enHilo ? r.gmail_last_message_id : null,
      adjunto,
      reservationId,
      templateSlug: slug,
    });
    if (!res.ok) return { ok: false, error: res.error };
    if (!opts.copiaAMi) {
      const cambios: Record<string, unknown> = { menu_sent_at: new Date().toISOString() };
      if (!r.gmail_thread_id && res.threadId) {
        cambios.gmail_thread_id = res.threadId;
        cambios.gmail_thread_subject = subject;
        cambios.gmail_thread_linked_at = new Date().toISOString();
      }
      if (res.messageId) cambios.gmail_last_message_id = res.messageId;
      await supabase.from("reservations").update(cambios).eq("id", reservationId);
      revalidatePath(`/caminos/${r.departure_id}`);
    }
    return { ok: true, via: "gmail", to };
  }

  const res = await enviarCorreo({ to, subject, html: a.correo.html, text: a.correo.text, tipo: "menu_restaurante", adjuntos: [adjunto], reservationId, templateSlug: slug });
  if (!res.ok) return { ok: false, error: res.error };
  if (!opts.copiaAMi) {
    await supabase.from("reservations").update({ menu_sent_at: new Date().toISOString() }).eq("id", reservationId);
    revalidatePath(`/caminos/${r.departure_id}`);
  }
  return { ok: true, via: "brevo", to };
}
