import { CONTACTO } from "@/lib/brand";
import { boton, envolturaCorreo, esc, ficha, fila, P, P_MINI, P_SERIF, parrafos } from "./shell";

/**
 * Las plantillas de correo de la fase de contratos.
 *
 * Cada una devuelve `{ subject, html, text }`. El texto plano no es un adorno: es lo que ve
 * quien tiene el HTML desactivado, y ayuda a que el correo no puntúe como spam.
 *
 * Los textos que Naty quiera cambiar sin desplegar viven en `email_templates.body_md` y
 * entran por el parámetro `cuerpo`. Lo de acá es la estructura, no la voz.
 */

export type Correo = { subject: string; html: string; text: string };

/** Saludo por nombre de pila, que es como habla la marca. */
function primerNombre(nombreCompleto: string): string {
  const n = nombreCompleto.trim().split(/\s+/)[0] ?? "";
  return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : "";
}

const CUERPO_FIRMAR_POR_DEFECTO = `Ya está listo tu contrato para el Camino. Es el acuerdo de prestación de servicios, con las condiciones del viaje y tu acuerdo de pago tal como lo hablamos.

Tómate el tiempo de leerlo completo antes de firmar. Si algo no te cuadra o quieres que lo revisemos, escríbeme y lo vemos con calma — no hay ninguna prisa.

Para firmarlo solo necesitas el celular: abres el enlace, lo lees, dibujas tu firma con el dedo y confirmas con un código que te llega a este mismo correo.`;

export function correoContratoParaFirmar(o: {
  nombre: string;
  camino: string;
  valorTotal: string;
  formaDePago: string;
  urlFirma: string;
  cuerpo?: string;
  urlVersionWeb?: string;
}): Correo {
  const hola = primerNombre(o.nombre);
  const contenido =
    fila(`<p style="${P_SERIF}">Hola, ${esc(hola)}.</p>`) +
    fila(parrafos(o.cuerpo?.trim() || CUERPO_FIRMAR_POR_DEFECTO)) +
    fila(
      ficha([
        ["Camino", o.camino],
        ["Valor", o.valorTotal],
        ["Forma de pago", o.formaDePago],
      ])
    ) +
    fila(`<p style="margin:6px 0 18px;">${boton("Leer y firmar mi contrato", o.urlFirma)}</p>`) +
    fila(
      `<p style="${P_MINI}">El enlace es personal: no lo reenvíes. Caduca en 21 días, y si se te vence te mandamos uno nuevo sin problema.</p>`
    );

  return {
    subject: `Tu contrato del ${o.camino}`,
    html: envolturaCorreo({
      eyebrow: "Contrato de viaje",
      preheader: `Tu contrato del ${o.camino} está listo para que lo leas y lo firmes.`,
      contenido,
      urlVersionWeb: o.urlVersionWeb,
    }),
    text: [
      `Hola, ${hola}.`,
      "",
      (o.cuerpo?.trim() || CUERPO_FIRMAR_POR_DEFECTO),
      "",
      `Camino: ${o.camino}`,
      `Valor: ${o.valorTotal}`,
      `Forma de pago: ${o.formaDePago}`,
      "",
      `Para leerlo y firmarlo, entra acá:`,
      o.urlFirma,
      "",
      `El enlace es personal: no lo reenvíes. Caduca en 21 días.`,
      "",
      `${CONTACTO.marca} · ${CONTACTO.whatsapp} · ${CONTACTO.correo}`,
    ].join("\n"),
  };
}

export function correoRecordatorioFirma(o: {
  nombre: string;
  camino: string;
  urlFirma: string;
  /** Cuántos días faltan para la salida, si ya es cerca. */
  diasParaSalir?: number | null;
  urlVersionWeb?: string;
}): Correo {
  const hola = primerNombre(o.nombre);
  const urge = o.diasParaSalir != null && o.diasParaSalir <= 15;
  const texto = urge
    ? `Faltan ${o.diasParaSalir} días para que salgamos y todavía no tenemos tu contrato firmado. Es el único trámite que nos queda pendiente contigo, y necesitamos cerrarlo antes de la salida.`
    : `Te escribo para recordarte que tu contrato del Camino sigue esperando tu firma. Si ya lo leíste y tienes dudas, dímelas y las resolvemos; y si se te pasó, se firma en dos minutos desde el celular.`;

  const contenido =
    fila(`<p style="${P_SERIF}">Hola, ${esc(hola)}.</p>`) +
    fila(parrafos(texto)) +
    fila(`<p style="margin:6px 0 18px;">${boton("Firmar ahora", o.urlFirma)}</p>`);

  return {
    subject: urge ? `Nos falta tu firma para el ${o.camino}` : `¿Firmamos tu contrato del Camino?`,
    html: envolturaCorreo({
      eyebrow: "Contrato pendiente",
      preheader: urge
        ? `Faltan ${o.diasParaSalir} días para la salida y falta tu firma.`
        : "Tu contrato sigue esperando tu firma.",
      contenido,
      urlVersionWeb: o.urlVersionWeb,
    }),
    text: [`Hola, ${hola}.`, "", texto, "", o.urlFirma, "", `${CONTACTO.marca} · ${CONTACTO.whatsapp}`].join("\n"),
  };
}

export function correoContratoFirmado(o: {
  nombre: string;
  camino: string;
  fechaFirma: string;
  huella: string;
  urlVerificacion: string;
  nombreAdjunto: string;
  urlVersionWeb?: string;
}): Correo {
  const hola = primerNombre(o.nombre);
  const contenido =
    fila(`<p style="${P_SERIF}">Listo, ${esc(hola)}. Ya está firmado.</p>`) +
    fila(
      parrafos(
        `Te adjunto tu contrato del ${o.camino}, firmado por las dos partes. Guárdalo: es tu copia.

Al final del documento vas a ver el Informe de Firmas, con la fecha, la hora y los datos de cada firma. Ahí queda registrado todo lo que hace falta para que valga como prueba.

Ahora sí: a preparar la mochila.`
      )
    ) +
    fila(
      ficha([
        ["Camino", o.camino],
        ["Firmado el", o.fechaFirma],
        ["Huella SHA-256", o.huella],
      ])
    ) +
    fila(
      `<p style="${P_MINI}">Si alguna vez quieres comprobar que el archivo que tienes es exactamente el que se firmó, ábrelo acá: <a href="${esc(o.urlVerificacion)}" style="color:#3D5A6E;">verificar documento</a>.</p>`
    ) +
    fila(`<p style="${P}">Buen Camino.</p>`);

  return {
    subject: `Tu contrato firmado · ${o.camino}`,
    html: envolturaCorreo({
      eyebrow: "Contrato firmado",
      preheader: `Adjunto va tu contrato del ${o.camino}, firmado por las dos partes.`,
      contenido,
      urlVersionWeb: o.urlVersionWeb,
    }),
    text: [
      `Listo, ${hola}. Ya está firmado.`,
      "",
      `Te adjunto tu contrato del ${o.camino} (${o.nombreAdjunto}), firmado por las dos partes. Guárdalo: es tu copia.`,
      "",
      `Firmado el: ${o.fechaFirma}`,
      `Huella SHA-256: ${o.huella}`,
      `Verificar el documento: ${o.urlVerificacion}`,
      "",
      `Buen Camino.`,
      `${CONTACTO.marca} · ${CONTACTO.whatsapp} · ${CONTACTO.correo}`,
    ].join("\n"),
  };
}

/**
 * El código de un solo uso. Es el correo más importante del flujo y el más corto: quien lo
 * abre está a un paso de firmar, casi siempre desde el celular. Nada que distraiga, el
 * código grande y legible, y la advertencia de que nadie debería pedírselo.
 */
export function correoCodigoDeFirma(o: { nombre: string; codigo: string; minutos: number }): Correo {
  const hola = primerNombre(o.nombre);
  const contenido =
    fila(`<p style="${P}">Hola, ${esc(hola)}. Este es tu código para firmar:</p>`) +
    fila(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
         <tr><td align="center" style="background:#E8D9C0;border-left:3px solid #C4822A;border-radius:4px;padding:20px 12px;">
           <div style="font-family:Georgia,'Times New Roman',serif;font-size:36px;letter-spacing:10px;color:#1A2E3D;font-weight:bold;">${esc(o.codigo)}</div>
           <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8B6A3E;margin-top:8px;">Vence en ${o.minutos} minutos</div>
         </td></tr>
       </table>`
    ) +
    fila(
      `<p style="${P_MINI}">Escríbelo en la página donde estás firmando. Si no fuiste tú quien lo pidió, ignora este correo — sin el código nadie puede firmar por ti. Nunca te lo vamos a pedir por WhatsApp ni por teléfono.</p>`
    );

  return {
    subject: `${o.codigo} es tu código para firmar`,
    html: envolturaCorreo({
      eyebrow: "Código de firma",
      preheader: `Tu código es ${o.codigo}. Vence en ${o.minutos} minutos.`,
      contenido,
    }),
    text: [
      `Hola, ${hola}. Este es tu código para firmar:`,
      "",
      `    ${o.codigo}`,
      "",
      `Vence en ${o.minutos} minutos.`,
      `Si no fuiste tú quien lo pidió, ignora este correo. Nunca te lo vamos a pedir por WhatsApp ni por teléfono.`,
      "",
      `${CONTACTO.marca} · ${CONTACTO.whatsapp}`,
    ].join("\n"),
  };
}
