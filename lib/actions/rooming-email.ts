"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { CONTACTO } from "@/lib/brand";
import { cargarRooming, filasDe, habitacionesDe, libroDeHotel } from "@/lib/export/rooming";
import { correoRoomingList } from "@/lib/email/plantillas-proveedores";
import { enviarPorGmail, gmailNoConfigurado } from "@/lib/email/gmail";
import { enviarCorreo } from "@/lib/email/send";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type VistaPreviaRooming = {
  to: string | null;
  subject: string;
  html: string;
  filename: string;
  hotel: string;
  hilo: { threadId: string; subject: string | null } | null;
  /** Si sale por Gmail (en el hilo) o por Brevo (correo nuevo desde reservas@). */
  via: "gmail" | "brevo";
  aviso: string | null;
  personas: number;
  habitaciones: number;
  enviadoEl: string | null;
};

type Armado = {
  reservation: any;
  correo: ReturnType<typeof correoRoomingList>;
  libro: NonNullable<ReturnType<typeof libroDeHotel>>;
  personas: number;
  habitaciones: number;
};

async function armar(supabase: any, reservationId: string, notaExtra?: string | null): Promise<Resultado<Armado>> {
  const { data: r, error } = await supabase
    .from("reservations")
    .select("id, departure_id, check_in, check_out, confirmation_ref, menu_required, gmail_thread_id, gmail_last_message_id, gmail_thread_subject, rooming_sent_at, providers(id, name, email, contact_name)")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!r) return { ok: false, error: "No encontré la reserva." };

  const datos = await cargarRooming(supabase, r.departure_id);
  if (!datos) return { ok: false, error: "No encontré el camino." };
  // Se manda la reserva (una noche); si el mismo hotel tiene dos noches seguidas, cada
  // reserva lleva su rooming list.
  const filas = filasDe(datos, { reservationId });
  if (filas.length === 0) return { ok: false, error: "Esta reserva no tiene habitaciones desglosadas: no hay rooming list que mandar." };
  const habitaciones = habitacionesDe(filas);
  const personas = habitaciones.reduce((s, h) => s + h.huespedes.length, 0);
  if (personas === 0) return { ok: false, error: "Nadie tiene habitación asignada todavía en esta noche." };

  const fechas = r.check_out && r.check_out !== r.check_in ? `${formatDate(r.check_in)} al ${formatDate(r.check_out)}` : formatDate(r.check_in);
  const dietas = filas
    .filter((f: any) => f.pilgrim_id && f.dietary_notes)
    .map((f: any) => [String(f.pilgrim_name), String(f.dietary_notes)] as [string, string]);
  const correo = correoRoomingList({
    contacto: r.providers?.contact_name ?? null,
    hotel: r.providers?.name ?? "Hotel",
    camino: datos.caminoNombre,
    fechas,
    referencia: r.confirmation_ref ?? null,
    habitaciones,
    noSeHospedan: datos.noSeHospedan.get(reservationId) ?? [],
    dietas,
    menuPendiente: !!r.menu_required,
    notaExtra: notaExtra ?? null,
  });
  const libro = libroDeHotel(datos, filas);
  if (!libro) return { ok: false, error: "No se pudo armar el Excel." };
  return { ok: true, reservation: r, correo, libro, personas, habitaciones: habitaciones.length };
}

/** Lo que se va a mandar, para verlo antes de tocar Enviar. */
export async function previsualizarRoomingList(reservationId: string, notaExtra?: string | null): Promise<Resultado<VistaPreviaRooming>> {
  const supabase = createClient();
  const a = await armar(supabase, reservationId, notaExtra);
  if (!a.ok) return a;
  const r = a.reservation;
  const sinGmail = gmailNoConfigurado();
  const to = (r.providers?.email ?? "").trim() || null;
  let aviso: string | null = null;
  if (!to) aviso = `${r.providers?.name ?? "El hotel"} no tiene correo cargado. Ponéselo en Proveedores.`;
  else if (sinGmail) aviso = `${sinGmail} Saldría por Brevo desde reservas@, fuera del hilo.`;
  else if (!r.gmail_thread_id) aviso = "Esta reserva no tiene hilo de Gmail enlazado: saldrá como correo nuevo desde elcaminoconnaty@gmail.com. Si ya hay un hilo con el hotel, enlazalo primero.";
  return {
    ok: true,
    to,
    subject: r.gmail_thread_id && r.gmail_thread_subject ? `Re: ${String(r.gmail_thread_subject).replace(/^re:\s*/i, "")}` : a.correo.subject,
    html: a.correo.html,
    filename: a.libro.filename,
    hotel: r.providers?.name ?? "Hotel",
    hilo: r.gmail_thread_id ? { threadId: r.gmail_thread_id, subject: r.gmail_thread_subject ?? null } : null,
    via: sinGmail ? "brevo" : "gmail",
    aviso,
    personas: a.personas,
    habitaciones: a.habitaciones,
    enviadoEl: r.rooming_sent_at ?? null,
  };
}

/**
 * Manda el rooming list al hotel. Por Gmail dentro del hilo enlazado (o como correo
 * nuevo, y en ese caso el hilo que abre queda enlazado a la reserva); si Gmail no está
 * configurado, por Brevo. `copiaAMi` lo manda a nuestro buzón en vez de al hotel.
 */
export async function enviarRoomingListAlHotel(
  reservationId: string,
  opts: { copiaAMi?: boolean; notaExtra?: string | null } = {}
): Promise<Resultado<{ via: "gmail" | "brevo"; to: string }>> {
  const supabase = createClient();
  const a = await armar(supabase, reservationId, opts.notaExtra);
  if (!a.ok) return a;
  const r = a.reservation;
  const to = opts.copiaAMi ? CONTACTO.correo : ((r.providers?.email ?? "").trim() || null);
  if (!to) return { ok: false, error: `${r.providers?.name ?? "El hotel"} no tiene correo cargado.` };
  const adjunto = { filename: a.libro.filename, content: a.libro.buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  const enHilo = !opts.copiaAMi && !!r.gmail_thread_id;
  const subject = enHilo && r.gmail_thread_subject ? `Re: ${String(r.gmail_thread_subject).replace(/^re:\s*/i, "")}` : a.correo.subject;

  if (!gmailNoConfigurado()) {
    const res = await enviarPorGmail({
      to,
      subject,
      html: a.correo.html,
      text: a.correo.text,
      tipo: "rooming_list",
      threadId: enHilo ? r.gmail_thread_id : null,
      inReplyToMessageId: enHilo ? r.gmail_last_message_id : null,
      adjunto,
      reservationId,
      templateSlug: opts.copiaAMi ? "rooming_list_prueba" : "rooming_list",
    });
    if (!res.ok) return { ok: false, error: res.error };
    if (!opts.copiaAMi) {
      const cambios: Record<string, unknown> = { rooming_sent_at: new Date().toISOString() };
      // Un correo nuevo abre un hilo: queda enlazado para que el menú salga por el mismo.
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

  const res = await enviarCorreo({ to, subject, html: a.correo.html, text: a.correo.text, tipo: "rooming_list", adjuntos: [adjunto], reservationId, templateSlug: opts.copiaAMi ? "rooming_list_prueba" : "rooming_list" });
  if (!res.ok) return { ok: false, error: res.error };
  if (!opts.copiaAMi) {
    await supabase.from("reservations").update({ rooming_sent_at: new Date().toISOString() }).eq("id", reservationId);
    revalidatePath(`/caminos/${r.departure_id}`);
  }
  return { ok: true, via: "brevo", to };
}
