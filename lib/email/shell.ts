/**
 * La papelería de correo de El Camino con Naty.
 *
 * Maquetar correo no es maquetar web. Outlook de escritorio pinta con el motor de Word, así
 * que acá no hay flexbox, ni grid, ni `<style>` que se pueda dar por aplicado: todo va en
 * tablas y con estilos en línea. El `<style>` del head existe solo para las media queries
 * del móvil, y es un extra — si un cliente lo ignora, el correo se sigue leyendo, porque el
 * ancho base ya es `max-width:100%`.
 *
 * Dos reglas más, heredadas de la auditoría de Camino Sacro:
 *
 * - **Cero `<img>` remotas.** Nada de logos alojados ni píxeles de seguimiento. El correo
 *   pesa poco (muy por debajo de los ~102 kB donde Gmail recorta) y no depende de que el
 *   lector pulse "mostrar imágenes" para entenderse. La cabecera de marca es tipográfica.
 * - **Sin webfonts.** Cinzel y Cormorant no existen en Gmail ni en Outlook, así que se usa
 *   la escalera de respaldo de `lib/brand.ts`: Georgia hace de serif de marca y Arial de
 *   cuerpo. Se ve de la misma familia sin cargar nada.
 */
import { COLOR, CONTACTO, FUENTE_CORREO } from "@/lib/brand";

/** Escapa texto que va a HTML. Todo lo que venga de la base pasa por acá. */
export function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Párrafo del cuerpo. */
export const P = `margin:0 0 14px;font-family:${FUENTE_CORREO.body};font-size:15px;line-height:1.65;color:${COLOR.noche};`;
/** Letra pequeña: notas, legales, pies de bloque. */
export const P_MINI = `margin:0 0 10px;font-family:${FUENTE_CORREO.body};font-size:12px;line-height:1.6;color:${COLOR.castano};`;
/** Cita o frase de marca, en la serif. */
export const P_SERIF = `margin:0 0 14px;font-family:${FUENTE_CORREO.display};font-size:17px;line-height:1.55;color:${COLOR.atlantico};`;

/**
 * Texto libre escrito por Naty en el CRM → párrafos HTML.
 * Doble salto separa párrafos; salto suelto es un `<br>`. Así nadie tiene que escribir
 * HTML dentro de un textarea.
 */
export function parrafos(texto: string, estilo: string = P): string {
  return texto
    .split(/\n{2,}/)
    .map((bloque) => `<p style="${estilo}">${esc(bloque.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** En correo un botón es un `<a>` con relleno. Nunca un `<button>`. */
export function boton(texto: string, url: string): string {
  return `<a href="${esc(url)}" class="cs-btn" style="display:inline-block;background:${COLOR.ocreProfundo};color:${COLOR.alba};text-decoration:none;font-family:${FUENTE_CORREO.body};font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;padding:12px 24px;border-radius:4px;">${esc(texto)}</a>`;
}

/** Bloque de datos destacado, sobre Piedra con filo Ocre. */
export function ficha(filas: Array<[string, string]>): string {
  const tr = filas
    .map(
      ([k, v]) =>
        `<tr>
           <td style="padding:4px 12px 4px 0;font-family:${FUENTE_CORREO.body};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${COLOR.ocreProfundo};white-space:nowrap;">${esc(k)}</td>
           <td style="padding:4px 0;font-family:${FUENTE_CORREO.body};font-size:14px;color:${COLOR.noche};">${esc(v)}</td>
         </tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR.piedra};border-left:3px solid ${COLOR.ocre};border-radius:4px;margin:0 0 18px;">
            <tr><td style="padding:14px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${tr}</table></td></tr>
          </table>`;
}

/** Separador fino. */
export const REGLA = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${COLOR.piedra};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`;

export type EnvolturaOpts = {
  /** Rótulo pequeño en Ocre bajo el nombre de marca. Ej: "CONTRATO DE VIAJE". */
  eyebrow: string;
  /** Lo que lee la bandeja de entrada sin abrir el correo. */
  preheader: string;
  /** El cuerpo, ya maquetado en filas de tabla (`fila()` ayuda). */
  contenido: string;
  /** Pie personalizado. Por defecto, los datos de contacto. */
  pie?: string;
  /** Si se pasa, aparece la barra "¿No ves bien este correo? Ábrelo aquí". */
  urlVersionWeb?: string;
};

/** Una fila del cuerpo, con el relleno correcto y el fondo blanco cálido. */
export function fila(html: string): string {
  return `<tr><td class="cs-pad" style="padding:0 32px;background:${COLOR.alba};">${html}</td></tr>`;
}

/** Envuelve el contenido en la papelería completa. Devuelve un documento HTML entero. */
export function envolturaCorreo(o: EnvolturaOpts): string {
  const barraWeb = o.urlVersionWeb
    ? `<tr><td class="cs-pad" align="center" style="padding:10px 32px;background:${COLOR.piedra};">
         <span style="font-family:${FUENTE_CORREO.body};font-size:11px;color:${COLOR.castano};">¿No ves bien este correo? </span>
         <a href="${esc(o.urlVersionWeb)}" style="font-family:${FUENTE_CORREO.body};font-size:11px;color:${COLOR.atlantico};font-weight:bold;">Ábrelo aquí</a>
       </td></tr>`
    : "";

  const pie = o.pie ?? `${CONTACTO.whatsapp} · ${CONTACTO.correo}`;

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(CONTACTO.marca)}</title>
<style>
  @media only screen and (max-width:620px) {
    .cs-wrap { width:100% !important; }
    .cs-pad  { padding-left:20px !important; padding-right:20px !important; }
    .cs-stack, .cs-stack td { display:block !important; width:100% !important; text-align:left !important; }
    .cs-stack .cs-btn { display:block !important; text-align:center !important; margin-top:10px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLOR.piedra};">
<!-- El preheader: lo lee la bandeja de entrada y no se ve al abrir el correo. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.piedra};margin:0;padding:24px 0;">
<tr><td align="center">
<table role="presentation" class="cs-wrap" width="620" cellpadding="0" cellspacing="0" border="0" style="width:620px;max-width:100%;background:${COLOR.alba};border-radius:8px;overflow:hidden;">
  ${barraWeb}

  <!-- CABECERA DE MARCA. Tipográfica: sin imágenes que el cliente tenga que "mostrar". -->
  <tr><td class="cs-pad" style="background:${COLOR.atlantico};padding:26px 32px;">
    <div style="font-family:${FUENTE_CORREO.display};font-size:21px;letter-spacing:1.5px;color:${COLOR.alba};">${esc(CONTACTO.marca)}</div>
    <div style="font-family:${FUENTE_CORREO.body};font-size:11px;color:rgba(245,238,227,0.72);margin-top:5px;">Peregrinación consciente · ${esc(CONTACTO.sitio)}</div>
    <div style="font-family:${FUENTE_CORREO.body};font-size:10px;color:${COLOR.ocreClaro};letter-spacing:2.5px;margin-top:16px;">${esc(o.eyebrow.toUpperCase())}</div>
  </td></tr>

  <tr><td style="height:28px;background:${COLOR.alba};font-size:0;line-height:0;">&nbsp;</td></tr>
${o.contenido}
  <tr><td style="height:28px;background:${COLOR.alba};font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- PIE -->
  <tr><td class="cs-pad" style="background:${COLOR.atlantico};padding:18px 32px;">
    <div style="font-family:${FUENTE_CORREO.body};font-size:11px;color:rgba(245,238,227,0.85);">${esc(pie)}</div>
    <div style="font-family:${FUENTE_CORREO.display};font-size:12px;font-style:italic;color:${COLOR.ocreClaro};margin-top:8px;">Buen Camino</div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
