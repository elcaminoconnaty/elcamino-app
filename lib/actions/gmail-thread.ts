"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { buscarHilos, gmailNoConfigurado, type HiloGmail } from "@/lib/email/gmail";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Un hilo más lo que la ficha del proveedor no alcanza a decir. */
export type HiloDeReserva = HiloGmail & {
  /** Si el correo principal del proveedor aparece en el hilo. */
  coincideExacto: boolean;
  /** Qué tanto pinta a ser el hilo de ESTE camino. Ordena la lista. */
  puntaje: number;
};

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function mesesAntes(iso: string, n: number): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

function mesesDespues(iso: string, n: number): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

/** Gmail quiere las fechas como YYYY/MM/DD. */
function paraGmail(d: Date): string {
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Con un proveedor de siempre, los hilos de todos los caminos se llaman parecido. Esto
 * empuja hacia arriba el que pinta a ser el de este camino: actividad en la recta final
 * de la negociación, el mes de la cena nombrado, el año correcto, y un hilo con varias
 * idas y vueltas. Nombrar otro año es la señal más fuerte en contra: "Reserva Grupal 27
 * de abril de 2027" sigue viva en octubre de 2026 y si no se penaliza queda de primera.
 */
function puntajeDeHilo(
  h: HiloGmail,
  ctx: { fuerteDesde: number; fuerteHasta: number; mes: string | null; anio: string | null; otrosAnios: string[] }
): number {
  const texto = `${h.subject} ${h.firstSnippet} ${h.snippet}`.toLowerCase();
  let p = 0;
  const fin = h.date ? Date.parse(h.date) : NaN;
  if (!isNaN(fin) && fin >= ctx.fuerteDesde && fin <= ctx.fuerteHasta) p += 3;
  if (ctx.mes && texto.includes(ctx.mes)) p += 2;
  if (ctx.anio && texto.includes(ctx.anio)) p += 1;
  for (const otro of ctx.otrosAnios) if (texto.includes(otro)) p -= 3;
  if (h.messageCount >= 5) p += 1;
  return p;
}

/**
 * El hilo de Gmail de una reserva. Se enlaza una vez (el equipo elige cuál de los hilos
 * con ese proveedor es el de esta reserva) y desde ahí todos los correos de la reserva
 * —rooming list, menú— salen como respuesta dentro de ese hilo.
 *
 * Busca con todas las direcciones del proveedor (`email` + `alt_emails`) en una sola
 * consulta, porque la ficha envejece: el Parador pasó de `comercial.santiago2@` a
 * `comercial.santiago@`, y la cena de Che Opedrouzo se habla en el hilo de Pensión
 * Platas. Y la acota a la ventana del camino, que además es lo que la vuelve rápida:
 * el workflow baja un mensaje por llamada.
 */
export async function buscarHilosDeReserva(
  reservationId: string,
  opts: { todoElHistorico?: boolean } = {}
): Promise<Resultado<{ emails: string[]; ventana: { desde: string; hasta: string } | null; hilos: HiloDeReserva[] }>> {
  const problema = gmailNoConfigurado();
  if (problema) return { ok: false, error: problema };
  const supabase = createClient();
  const { data: r, error } = await supabase
    .from("reservations")
    .select("id, check_in, providers(name, email, alt_emails), departures(start_date, end_date)")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!r) return { ok: false, error: "No encontré la reserva." };

  const prov = (r as any).providers;
  const principal = String(prov?.email ?? "").trim();
  const alternos: string[] = Array.isArray(prov?.alt_emails) ? prov.alt_emails.map((x: any) => String(x).trim()) : [];
  const vistos = new Set<string>();
  const emails: string[] = [];
  for (const e of [principal, ...alternos]) {
    const dir = e.toLowerCase();
    if (dir && !vistos.has(dir)) {
      vistos.add(dir);
      emails.push(e);
    }
  }
  if (emails.length === 0)
    return { ok: false, error: `${prov?.name ?? "El proveedor"} no tiene correo cargado. Ponéselo en Proveedores y volvé acá.` };

  // La ventana arranca en el camino, no en la reserva: la negociación es del camino entero.
  const dep = (r as any).departures;
  const arranque: string | null = dep?.start_date ?? r.check_in ?? null;
  const cierre: string | null = dep?.end_date ?? r.check_in ?? null;
  let ventana: { desde: string; hasta: string } | null = null;
  if (!opts.todoElHistorico && arranque && cierre) {
    ventana = { desde: paraGmail(mesesAntes(arranque, 6)), hasta: paraGmail(mesesDespues(cierre, 2)) };
  }

  const res = await buscarHilos({ emails, desde: ventana?.desde ?? null, hasta: ventana?.hasta ?? null, limite: 60 });
  if (!res.ok) return res;

  const ctx = {
    fuerteDesde: arranque ? mesesAntes(arranque, 3).getTime() : -Infinity,
    fuerteHasta: cierre ? mesesDespues(cierre, 1).getTime() : Infinity,
    mes: r.check_in ? MESES[Number(String(r.check_in).slice(5, 7)) - 1] ?? null : null,
    anio: r.check_in ? String(r.check_in).slice(0, 4) : null,
    otrosAnios: [] as string[],
  };
  if (ctx.anio) {
    const n = Number(ctx.anio);
    ctx.otrosAnios = [n - 2, n - 1, n + 1, n + 2].map(String);
  }

  const minuscula = principal.toLowerCase();
  const hilos = res.hilos
    .map((h) => ({
      ...h,
      coincideExacto: h.participants.some((p) => p.toLowerCase() === minuscula),
      puntaje: puntajeDeHilo(h, ctx),
    }))
    .sort((a, b) => {
      if (b.puntaje !== a.puntaje) return b.puntaje - a.puntaje;
      return (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0);
    });

  return { ok: true, emails, ventana, hilos };
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
