import "server-only";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";
import { CONTACTO } from "@/lib/brand";

/**
 * El único sitio desde el que salen correos.
 *
 * Sale por Gmail SMTP con una contraseña de aplicación, así que el remitente es literalmente
 * `elcaminoconnaty@gmail.com` — el que los peregrinos ya conocen — y de DKIM, SPF y DMARC se
 * encarga Google. El límite de Gmail son 500 correos al día; con grupos de veinte personas
 * cada seis meses, sobra.
 *
 * Tres reglas que salieron de la auditoría de Camino Sacro:
 *
 * 1. **`ok: true` no significa "llegó".** Significa que el servidor lo aceptó. Por eso
 *    `email_log.status` distingue `aceptado` de `confirmado` (con el `message_id` del
 *    servidor), y quien llama nunca puede confundir las dos cosas.
 * 2. **Nunca lanza.** Un correo que falla no puede tumbar la acción que lo disparó — si se
 *    firmó un contrato, se firmó, aunque el acuse no salga. Devuelve un error legible.
 * 3. **Lista blanca de adjuntos.** Un `.heic` rechazado por el servidor se lleva el correo
 *    entero por delante, no solo el adjunto.
 */

/** Extensiones que aceptamos adjuntar. Lo que no esté acá se rechaza antes de enviar. */
const ADJUNTOS_PERMITIDOS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".txt", ".csv", ".ics"]);

const MAX_ADJUNTO_BYTES = 20 * 1024 * 1024; // Gmail corta en 25 MB con el encabezado incluido.

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

function transporte() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Faltan GMAIL_USER y GMAIL_APP_PASSWORD. Se generan en Cuenta de Google → Seguridad → Contraseñas de aplicaciones."
    );
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
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
  for (const a of adjuntos ?? []) {
    const ext = extension(a.filename);
    if (!ADJUNTOS_PERMITIDOS.has(ext)) {
      return `El adjunto "${a.filename}" es de un tipo que no aceptamos (${ext || "sin extensión"}).`;
    }
    if (a.content.length > MAX_ADJUNTO_BYTES) {
      return `El adjunto "${a.filename}" pesa ${(a.content.length / 1024 / 1024).toFixed(1)} MB y el máximo son 20 MB.`;
    }
  }
  return null;
}

/** Registra el intento. Nunca lanza: un fallo de bitácora no puede tumbar un envío. */
async function registrar(
  args: EnviarArgs,
  estado: "aceptado" | "confirmado" | "error",
  extra: { messageId?: string | null; error?: string | null }
): Promise<string | null> {
  try {
    const supabase = createClient();
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
    const info = await transporte().sendMail({
      from: `"${CONTACTO.marca}" <${process.env.GMAIL_USER}>`,
      replyTo: CONTACTO.correo,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      attachments: args.adjuntos?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    // Gmail devuelve messageId y la lista de destinatarios aceptados. Si el nuestro no está
    // en `accepted`, el correo no salió aunque no haya excepción.
    const aceptado = (info.accepted ?? []).some(
      (d: string | { address: string }) =>
        String(typeof d === "string" ? d : d.address).toLowerCase() === args.to.toLowerCase()
    );
    if (!aceptado) {
      const error = `El servidor no aceptó la dirección ${args.to}.`;
      const logId = await registrar(args, "error", { error, messageId: info.messageId });
      return { ok: false, error, logId };
    }

    const logId = await registrar(args, "confirmado", { messageId: info.messageId });
    return { ok: true, messageId: info.messageId, logId };
  } catch (e: any) {
    const error = e?.message ? String(e.message) : "No se pudo enviar el correo.";
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
