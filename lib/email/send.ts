import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTACTO } from "@/lib/brand";

/**
 * El único sitio desde el que salen correos.
 *
 * Sale por la **API de Brevo, sobre HTTPS**. No por SMTP, y eso no es una preferencia:
 * Railway desactiva el SMTP saliente en los planes Free, Trial y Hobby, así que el
 * `nodemailer` contra `smtp.gmail.com` que había acá antes funcionaba en local y en
 * producción se quedaba colgado hasta un `Connection timeout`. Se descubrió el 2026-09-07,
 * al mandar el primer contrato de verdad: el correo nunca salió. Brevo es lo que ya usa
 * Camino Sacro para lo mismo.
 *
 * El remitente es del dominio propio (`BREVO_SENDER_EMAIL`), autenticado en Brevo con DKIM,
 * porque un `@gmail.com` enviado desde un tercero no pasa la autenticación del dominio y
 * Outlook y Hotmail lo mandan a spam. El responder-a sigue siendo el buzón que Naty lee.
 *
 * Tres reglas que salieron de la auditoría de Camino Sacro:
 *
 * 1. **`ok: true` no significa "llegó".** Significa que Brevo lo aceptó y le dio un id. Por
 *    eso `email_log.status` distingue `aceptado` de `confirmado`, y quien llama nunca puede
 *    confundir las dos cosas.
 * 2. **Nunca lanza.** Un correo que falla no puede tumbar la acción que lo disparó — si se
 *    firmó un contrato, se firmó, aunque el acuse no salga. Devuelve un error legible.
 * 3. **Lista blanca de adjuntos.** Un `.heic` rechazado por el servidor se lleva el correo
 *    entero por delante, no solo el adjunto.
 */

/** Extensiones que aceptamos adjuntar. Lo que no esté acá se rechaza antes de enviar. */
const ADJUNTOS_PERMITIDOS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".txt", ".csv", ".ics"]);

/**
 * Brevo corta el correo entero en 10 MB y los adjuntos viajan en base64 dentro del JSON, que
 * infla un tercio. 6 MB de archivo son ~8 MB de petición: es el techo que deja margen para
 * el HTML. Un contrato pesa cientos de kilobytes, así que sobra.
 */
const MAX_ADJUNTO_BYTES = 6 * 1024 * 1024;
const MAX_ADJUNTOS_TOTAL_BYTES = 6 * 1024 * 1024;

export type Adjunto = { filename: string; content: Buffer; contentType?: string };

export type TipoCorreo =
  | "contrato_firmar"
  | "contrato_recordatorio"
  | "contrato_firmado"
  | "documento_viaje"
  | "aviso_interno"
  | "prueba";

export type EnviarArgs = {
  to: string;
  subject: string;
  /** El HTML ya envuelto en la papelería (`envolturaCorreo`). */
  html: string;
  /** Versión en texto plano. Siempre viaja: es lo que ve quien tiene el HTML desactivado. */
  text: string;
  tipo: TipoCorreo;
  adjuntos?: Adjunto[];
  /** Para cruzar el correo con la inscripción del peregrino. */
  registrationId?: string | null;
  templateSlug?: string | null;
  /** Token de la versión web, si este correo tiene una. */
  tokenVersionWeb?: string | null;
  /** Cuántos días vive la versión web. Por defecto 180. */
  diasVersionWeb?: number;
};

export type ResultadoEnvio =
  | { ok: true; messageId: string; logId: string | null }
  | { ok: false; error: string; logId: string | null };

/** Token de la versión web del correo. 24 bytes = 192 bits. */
export function nuevoTokenCorreo(): string {
  return crypto.randomBytes(24).toString("hex");
}

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Lo que Brevo necesita para dejarnos enviar. Se lee en cada envío y no al cargar el módulo:
 * si faltara al arrancar, el fallo saldría en un sitio que no tiene nada que ver.
 */
function configuracion() {
  const apiKey = process.env.BREVO_API_KEY;
  const remitente = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey) {
    throw new Error(
      "Falta BREVO_API_KEY. Se genera en Brevo → SMTP & API → API Keys, y va en las variables de Railway."
    );
  }
  if (!remitente) {
    throw new Error(
      "Falta BREVO_SENDER_EMAIL. Tiene que ser una dirección del dominio autenticado en Brevo " +
        "(Senders, Domains & Dedicated IPs), no un @gmail.com: si no, Outlook lo manda a spam."
    );
  }
  return { apiKey, remitente };
}

/**
 * ¿Está el correo configurado? Se pregunta antes de un envío en lote: sin esto, una clave
 * que falta se ve como trece fallos idénticos e ilegibles, uno por peregrino, después de
 * haber generado trece contratos.
 */
export async function problemaDeConfiguracion(): Promise<string | null> {
  try {
    configuracion();
    return null;
  } catch (e: any) {
    return e?.message ?? "El correo no está configurado.";
  }
}

function extension(nombre: string): string {
  const i = nombre.lastIndexOf(".");
  return i < 0 ? "" : nombre.slice(i).toLowerCase();
}

/**
 * Revisa los adjuntos antes de tocar el servidor. Devuelve el motivo del primero que falle,
 * o `null` si están todos bien.
 */
export function adjuntoNoSoportado(adjuntos: Adjunto[] | undefined): string | null {
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  let total = 0;
  for (const a of adjuntos ?? []) {
    const ext = extension(a.filename);
    if (!ADJUNTOS_PERMITIDOS.has(ext)) {
      return `El adjunto "${a.filename}" es de un tipo que no aceptamos (${ext || "sin extensión"}).`;
    }
    if (a.content.length > MAX_ADJUNTO_BYTES) {
      return `El adjunto "${a.filename}" pesa ${mb(a.content.length)} MB y el máximo son ${mb(MAX_ADJUNTO_BYTES)} MB.`;
    }
    total += a.content.length;
  }
  // Brevo mide el correo entero, no cada archivo: tres adjuntos que pasan sueltos pueden
  // pasarse juntos.
  if (total > MAX_ADJUNTOS_TOTAL_BYTES) {
    return `Los adjuntos suman ${mb(total)} MB y entre todos no pueden pasar de ${mb(MAX_ADJUNTOS_TOTAL_BYTES)} MB.`;
  }
  return null;
}

/**
 * Registra el intento. Nunca lanza: un fallo de bitácora no puede tumbar un envío.
 *
 * Escribe con la llave de servicio, no con la de sesión. El correo del código de firma y el
 * del contrato firmado salen del flujo público, donde el peregrino no tiene cuenta: con el
 * cliente de sesión el insert lo rechazaba RLS, el `catch` se lo tragaba y esos dos correos
 * —los dos únicos que importa poder rastrear— no dejaban ni rastro. Acá no aplica la regla
 * de `admin.ts` sobre filtros validados por token: no se consulta nada de nadie, se inserta
 * una fila nuestra.
 */
async function registrar(
  args: EnviarArgs,
  estado: "aceptado" | "confirmado" | "error",
  extra: { messageId?: string | null; error?: string | null }
): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("email_log")
      .insert({
        registration_id: args.registrationId ?? null,
        template_slug: args.templateSlug ?? args.tipo,
        to_email: args.to,
        subject: args.subject,
        sent_at: new Date().toISOString(),
        status: estado,
        error: extra.error ?? null,
        message_id: extra.messageId ?? null,
        html: args.html,
        token: args.tokenVersionWeb ?? null,
        expires_at: args.tokenVersionWeb
          ? new Date(Date.now() + (args.diasVersionWeb ?? 180) * 864e5).toISOString()
          : null,
        metadata: { tipo: args.tipo, adjuntos: (args.adjuntos ?? []).map((a) => a.filename) },
      })
      .select("id")
      .single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function enviarCorreo(args: EnviarArgs): Promise<ResultadoEnvio> {
  const problema = adjuntoNoSoportado(args.adjuntos);
  if (problema) {
    const logId = await registrar(args, "error", { error: problema });
    return { ok: false, error: problema, logId };
  }

  try {
    const { apiKey, remitente } = configuracion();

    const cuerpo: Record<string, unknown> = {
      sender: { name: CONTACTO.marca, email: remitente },
      to: [{ email: args.to }],
      // El remitente es del dominio, pero quien responda tiene que caer en el buzón que
      // Naty lee todos los días.
      replyTo: { email: CONTACTO.correo, name: CONTACTO.marca },
      subject: args.subject,
      htmlContent: args.html,
      textContent: args.text,
    };
    if (args.adjuntos?.length) {
      // En base64 dentro de la petición, no como URL: la alternativa sería firmar una URL
      // del cubo, y una URL de Storage no puede salir nunca en un correo.
      cuerpo.attachment = args.adjuntos.map((a) => ({
        name: a.filename,
        content: a.content.toString("base64"),
      }));
    }

    // Sin timeout, un Brevo lento deja colgada la acción de Naty sin decir nada — que es
    // exactamente como se comportaba el SMTP bloqueado.
    const corte = AbortSignal.timeout(30_000);
    const r = await fetch(BREVO_URL, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(cuerpo),
      signal: corte,
    });

    const texto = await r.text();
    let datos: any = null;
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      // Brevo devolvió algo que no es JSON (un 502 del borde, por ejemplo).
    }

    if (!r.ok) {
      // Brevo explica el motivo en `message`, y es lo que Naty necesita leer: un remitente
      // sin verificar o una clave revocada se arreglan solos si se dicen con esas palabras.
      const error = datos?.message
        ? `Brevo rechazó el envío: ${datos.message}`
        : `Brevo respondió ${r.status}. ${texto.slice(0, 200)}`;
      const logId = await registrar(args, "error", { error });
      return { ok: false, error, logId };
    }

    const messageId = datos?.messageId ? String(datos.messageId) : "";
    if (!messageId) {
      // 2xx sin id: lo aceptó, pero no tenemos con qué rastrearlo. No es lo mismo que
      // confirmado y la bitácora tiene que distinguirlo.
      const logId = await registrar(args, "aceptado", { error: "Brevo aceptó el correo sin devolver messageId." });
      return { ok: true, messageId: "", logId };
    }

    const logId = await registrar(args, "confirmado", { messageId });
    return { ok: true, messageId, logId };
  } catch (e: any) {
    const error =
      e?.name === "TimeoutError" || e?.name === "AbortError"
        ? "Brevo no respondió en 30 segundos."
        : e?.message
          ? String(e.message)
          : "No se pudo enviar el correo.";
    const logId = await registrar(args, "error", { error });
    return { ok: false, error, logId };
  }
}

/**
 * Aviso a Naty. Va en un envío aparte, nunca encadenado al del peregrino: si el correo al
 * peregrino falla, ella se tiene que enterar igual — en Camino Sacro las dos ramas iban en
 * serie y un adjunto rechazado apagaba las dos.
 */
export async function avisoInterno(asunto: string, cuerpo: string): Promise<ResultadoEnvio> {
  return enviarCorreo({
    to: CONTACTO.correo,
    subject: `[Plataforma] ${asunto}`,
    html: `<pre style="font-family:Arial,Helvetica,sans-serif;font-size:14px;white-space:pre-wrap;">${cuerpo.replace(/</g, "&lt;")}</pre>`,
    text: cuerpo,
    tipo: "aviso_interno",
  });
}
