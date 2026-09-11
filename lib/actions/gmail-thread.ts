"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { buscarHilos, gmailNoConfigurado, type HiloGmail } from "@/lib/email/gmail";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * El hilo de Gmail de una reserva. Se enlaza una vez (el equipo elige cuál de los hilos
 * con ese proveedor es el de esta reserva) y desde ahí todos los correos de la reserva
 * —rooming list, menú— salen como respuesta dentro de ese hilo.
 */
export async function buscarHilosDeReserva(reservationId: string): Promise<Resultado<{ email: string; hilos: HiloGmail[] }>> {
  const problema = gmailNoConfigurado();
  if (problema) return { ok: false, error: problema };
  const supabase = createClient();
  const { data: r, error } = await supabase
    .from("reservations")
    .select("id, check_in, providers(name, email)")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!r) return { ok: false, error: "No encontré la reserva." };
  const email = ((r as any).providers?.email ?? "").trim();
  if (!email) return { ok: false, error: `${(r as any).providers?.name ?? "El proveedor"} no tiene correo cargado. Ponéselo en Proveedores y volvé acá.` };

  // Los hilos empiezan meses antes del check-in; seis meses atrás cubre de sobra.
  let desde: string | null = null;
  if (r.check_in) {
    const d = new Date(`${r.check_in}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 6);
    desde = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const res = await buscarHilos({ email, desde, limite: 60 });
  if (!res.ok) return res;
  return { ok: true, email, hilos: res.hilos };
}

export async function enlazarHilo(
  reservationId: string,
  hilo: { threadId: string; lastMessageId: string | null; subject: string | null },
  departureId?: string | null
): Promise<Resultado> {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({
      gmail_thread_id: hilo.threadId,
      gmail_last_message_id: hilo.lastMessageId,
      gmail_thread_subject: hilo.subject,
      gmail_thread_linked_at: new Date().toISOString(),
    })
    .eq("id", reservationId);
  if (error) return { ok: false, error: error.message };
  if (departureId) revalidatePath(`/caminos/${departureId}`);
  return { ok: true };
}

export async function desenlazarHilo(reservationId: string, departureId?: string | null): Promise<Resultado> {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ gmail_thread_id: null, gmail_last_message_id: null, gmail_thread_subject: null, gmail_thread_linked_at: null })
    .eq("id", reservationId);
  if (error) return { ok: false, error: error.message };
  if (departureId) revalidatePath(`/caminos/${departureId}`);
  return { ok: true };
}
