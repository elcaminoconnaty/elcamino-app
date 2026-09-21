import "server-only";
import { registrarCorreo, type Adjunto, type TipoCorreo } from "@/lib/email/send";

/**
 * Correos que tienen que salir desde elcaminoconnaty@gmail.com y **dentro del hilo** que
 * ya existe con el proveedor (la reserva se negoció por ahí, y el hotel espera el rooming
 * list en ese mismo hilo). Brevo no puede hacer eso: manda desde reservas@ y no toca el
 * buzón de Gmail. Lo hace n8n con la credencial OAuth de esa cuenta, en el workflow
 * "Plataforma → Gmail (hilos y envíos)"; acá solo se le pega a su webhook.
 *
 * Mismas reglas que `send.ts`: nunca lanza, y `ok: true` significa que Gmail aceptó el
 * mensaje y devolvió su id, no que llegó.
 */

export type HiloGmail = {
  threadId: string;
  subject: string;
  /** Fecha del último mensaje. */
  date: string | null;
  /** Fecha del primero: es la que dice si el hilo es de este camino o de otro. */
  firstDate: string | null;
  from: string;
  fromName: string;
  /** El último mensaje del hilo, sea de quien sea. */
  lastMessageId: string;
  /** El último que mandó el proveedor: es al que hay que responder para que caiga en su bandeja. */
  lastIncomingMessageId: string | null;
  messageCount: number;
  /** Las primeras líneas del último mensaje (el snippet que arma Gmail). */
  snippet: string;
  /** Las del primero: ahí suele estar el grupo y las fechas que se pidieron. */
  firstSnippet: string;
  /** Todos los correos que participan, menos el nuestro. */
  participants: string[];
  unread: boolean;
};

export type EnvioGmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  tipo: TipoCorreo;
  /** El hilo enlazado a la reserva. Sin esto sale un correo nuevo. */
  threadId?: string | null;
  inReplyToMessageId?: string | null;
  /** El workflow exige un adjunto (rooming list o menú). */
  adjunto: Adjunto;
  reservationId?: string | null;
  templateSlug?: string | null;
};

export type ResultadoGmail =
  | { ok: true; threadId: string | null; messageId: string | null; logId: string | null }
  | { ok: false; error: string; logId: string | null };

function configuracion(): { url: string; secreto: string } | null {
  const url = process.env.N8N_GMAIL_WEBHOOK_URL;
  const secreto = process.env.N8N_GMAIL_SECRET;
  if (!url || !secreto) return null;
  return { url, secreto };
}

/** Por qué no se puede mandar por Gmail, o null si está listo. */
export function gmailNoConfigurado(): string | null {
  return configuracion()
    ? null
    : "Gmail no está configurado: faltan N8N_GMAIL_WEBHOOK_URL y N8N_GMAIL_SECRET en las variables de Railway.";
}

async function llamar(body: Record<string, unknown>, timeoutMs: number): Promise<{ ok: true; datos: any } | { ok: false; error: string }> {
  const cfg = configuracion();
  if (!cfg) return { ok: false, error: gmailNoConfigurado()! };
  try {
    const r = await fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": cfg.secreto },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const texto = await r.text();
    let datos: any = null;
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      // n8n devolvió algo que no es JSON (un 502 del borde, por ejemplo).
    }
    if (!r.ok || !datos || datos.ok === false) {
      const motivo = datos?.error ? String(datos.error) : `n8n respondió ${r.status}. ${texto.slice(0, 200)}`;
      // El mensaje típico cuando hay que reconectar la cuenta en n8n.
      const legible = /authorization grant|invalid_grant|refresh token/i.test(motivo)
        ? "Gmail rechazó la credencial: hay que volver a conectar la cuenta elcaminoconnaty@gmail.com en n8n (Credentials → Gmail account → Reconnect)."
        : motivo;
      return { ok: false, error: legible };
    }
    return { ok: true, datos };
  } catch (e: any) {
    const error =
      e?.name === "TimeoutError" || e?.name === "AbortError"
        ? `n8n no respondió en ${Math.round(timeoutMs / 1000)} segundos.`
        : e?.message
          ? String(e.message)
          : "No se pudo hablar con n8n.";
    return { ok: false, error };
  }
}

/**
 * Los hilos de Gmail con ese correo, del más reciente al más viejo. `desde` en YYYY/MM/DD
 * (formato de Gmail).
 *
 * Busca con todas las direcciones a la vez (`from:` u `to:` de cualquiera). Es lenta: el
 * workflow baja un mensaje por llamada (~0,9 s cada uno), así que acotarla con
 * `desde`/`hasta` no es solo para afinar el resultado, también es lo que la mantiene
 * dentro del timeout. Se arreglaría de raíz pasando el workflow a `thread:getAll` +
 * `thread:get`, que baja un hilo por llamada en vez de un mensaje.
 */
export async function buscarHilos(args: { emails: string[]; desde?: string | null; hasta?: string | null; limite?: number }): Promise<{ ok: true; hilos: HiloGmail[] } | { ok: false; error: string }> {
  const r = await llamar(
    {
      action: "threads.search",
      emails: args.emails,
      after: args.desde ?? undefined,
      before: args.hasta ?? undefined,
      limit: args.limite ?? 60,
    },
    120_000
  );
  if (!r.ok) return r;
  const hilos: HiloGmail[] = Array.isArray(r.datos.hilos)
    ? r.datos.hilos.map((h: any) => ({
        threadId: String(h.threadId),
        subject: String(h.subject ?? "(sin asunto)"),
        date: h.date ? String(h.date) : null,
        firstDate: h.firstDate ? String(h.firstDate) : null,
        from: String(h.from ?? ""),
        fromName: String(h.fromName ?? ""),
        lastMessageId: String(h.lastMessageId ?? ""),
        lastIncomingMessageId: h.lastIncomingMessageId ? String(h.lastIncomingMessageId) : null,
        messageCount: Number(h.messageCount ?? 0),
        snippet: String(h.snippet ?? ""),
        firstSnippet: String(h.firstSnippet ?? ""),
        participants: Array.isArray(h.participants) ? h.participants.map((p: any) => String(p)) : [],
        unread: Boolean(h.unread),
      }))
    : [];
  return { ok: true, hilos };
}

/** Manda por Gmail: responde en el hilo si hay uno, o abre un correo nuevo. Registra en email_log. */
export async function enviarPorGmail(args: EnvioGmail): Promise<ResultadoGmail> {
  const logArgs = {
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    tipo: args.tipo,
    adjuntos: [args.adjunto],
    reservationId: args.reservationId ?? null,
    templateSlug: args.templateSlug ?? null,
  };
  const r = await llamar(
    {
      action: "message.send",
      to: args.to,
      subject: args.subject,
      html: args.html,
      threadId: args.threadId ?? undefined,
      inReplyToMessageId: args.inReplyToMessageId ?? undefined,
      attachment: {
        filename: args.adjunto.filename,
        mimeType: args.adjunto.contentType ?? "application/octet-stream",
        contentBase64: args.adjunto.content.toString("base64"),
      },
    },
    60_000
  );
  if (!r.ok) {
    const logId = await registrarCorreo(logArgs, "error", { error: r.error, metadata: { via: "gmail", thread_id: args.threadId ?? null } });
    return { ok: false, error: r.error, logId };
  }
  const messageId = r.datos.messageId ? String(r.datos.messageId) : null;
  const threadId = r.datos.threadId ? String(r.datos.threadId) : null;
  const logId = await registrarCorreo(logArgs, messageId ? "confirmado" : "aceptado", {
    messageId,
    metadata: { via: "gmail", thread_id: threadId, in_reply_to: args.inReplyToMessageId ?? null },
  });
  return { ok: true, threadId, messageId, logId };
}
