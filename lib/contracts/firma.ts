import "server-only";
import crypto from "node:crypto";

/**
 * Las piezas criptográficas de la firma electrónica.
 *
 * Nada de esto es exótico: un token largo, un código de un solo uso guardado como hash, y
 * la huella del documento. Lo que le da valor es que se guarde entero y no se pueda editar
 * después — de eso se encargan `contract_events` (append-only) y el sellado del PDF.
 */

/** Token del enlace de firma. 32 bytes = 256 bits, igual que el de Camino Sacro. */
export function nuevoToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Rechaza tokens cortos antes de tocar la base, para no dar pistas por tiempo de respuesta. */
export function tokenPlausible(token: string | undefined | null): token is string {
  return typeof token === "string" && /^[0-9a-f]{64}$/.test(token);
}

/** Huella del documento. Es lo que permite detectar cualquier alteración posterior. */
export function sha256(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Agrupa la huella de a cuatro para que se pueda leer y dictar por teléfono. */
export function huellaLegible(hex: string): string {
  return (hex.match(/.{1,4}/g) ?? [hex]).join(" ");
}

/** Código de un solo uso: seis dígitos, que es lo que la gente puede teclear sin equivocarse. */
export function nuevoCodigo(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * El código se guarda hasheado con el id del firmante como sal, para que dos firmantes con
 * el mismo código no compartan hash.
 */
export function hashCodigo(codigo: string, signerId: string): string {
  return crypto.createHash("sha256").update(`${signerId}:${codigo}`).digest("hex");
}

/** Comparación en tiempo constante: un `===` filtra información por el tiempo de respuesta. */
export function mismoHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Cuánto vive el código. Diez minutos: suficiente para ir al correo y volver. */
export const OTP_VIGENCIA_MIN = 10;
/** Cuántos intentos antes de bloquear. */
export const OTP_MAX_INTENTOS = 5;
/**
 * Cuánto vive el enlace de firma. Veintiún días, y cada recordatorio lo renueva, para que
 * el enlace del último correo siempre funcione.
 */
export const TOKEN_VIGENCIA_DIAS = 21;

// El texto del consentimiento vive aparte porque lo necesitan las dos orillas: el
// formulario del navegador para mostrarlo y el servidor para archivarlo con la firma.
export { CONSENTIMIENTO, textoConsentimiento } from "./consentimiento";
