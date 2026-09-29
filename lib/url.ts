/**
 * La URL pública de la plataforma, sin "/" al final. Fuente única para todo enlace que sale
 * hacia afuera (firmar contrato, registro, carta, menú, documento de viaje, videos, la URL
 * de verificación impresa en el PDF sellado).
 *
 * Si falta `NEXT_PUBLIC_APP_URL` cae al dominio de producción, nunca a localhost: un correo
 * o un WhatsApp con `localhost` no le sirve a nadie y un PDF sellado no se puede corregir.
 * localhost solo en `npm run dev`.
 */
export const URL_PRODUCCION = "https://elcamino-app-production.up.railway.app";

export function baseUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return URL_PRODUCCION;
}
