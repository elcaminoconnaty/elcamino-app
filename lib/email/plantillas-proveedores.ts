import { COLOR, CONTACTO, FUENTE_CORREO } from "@/lib/brand";
import { esc, fila, envolturaCorreo, P, P_MINI } from "@/lib/email/shell";
import { firmaHtml, firmaTexto } from "@/lib/email/firma";
import type { HabitacionRooming } from "@/lib/export/rooming";

/**
 * Los correos que van a proveedores (hoteles, restaurantes). Son la versión con marca de
 * lo que Nico mandaba a mano desde Gmail: saludo por nombre, la tabla en el cuerpo (el
 * hotel la lee en el celular sin abrir el adjunto), el Excel adjunto y su firma.
 */

export type Correo = { subject: string; html: string; text: string };

const TH = `padding:8px 10px;font-family:${FUENTE_CORREO.body};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${COLOR.alba};background:${COLOR.atlantico};text-align:left;`;
const TD = `padding:7px 10px;font-family:${FUENTE_CORREO.body};font-size:14px;color:${COLOR.noche};border-bottom:1px solid ${COLOR.piedra};vertical-align:top;`;
const TD_ROTULO = `${TD}font-weight:bold;color:${COLOR.ocreProfundo};white-space:nowrap;`;

function saludo(contacto: string | null | undefined, fallback: string) {
  const n = contacto?.trim().split(/\s+/)[0];
  return n ? `Hola, ${n}.` : `Hola, ${fallback}.`;
}

/** La tabla de habitaciones con huéspedes y pasaporte, como la del correo manual. */
export function tablaRooming(hotel: string, habitaciones: HabitacionRooming[]): string {
  const filas = habitaciones
    .map((h) => {
      const gente = h.huespedes.length > 0 ? h.huespedes : [{ nombre: "— libre —", pasaporte: null, dieta: null }];
      return gente
        .map(
          (g, i) => `<tr>
            ${i === 0 ? `<td rowspan="${gente.length}" style="${TD_ROTULO}">${esc(h.nombre.toUpperCase())}</td>` : ""}
            <td style="${TD}">${esc(g.nombre)}</td>
            <td style="${TD}white-space:nowrap;">${esc(g.pasaporte ?? "")}</td>
          </tr>`
        )
        .join("");
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${COLOR.piedra};border-radius:4px;margin:0 0 18px;">
    <tr><th colspan="3" style="${TH}text-align:center;font-size:13px;letter-spacing:2px;">${esc(hotel.toUpperCase())}</th></tr>
    <tr><th style="${TH}">Habitación</th><th style="${TH}">Huésped</th><th style="${TH}">Pasaporte</th></tr>
    ${filas}
  </table>`;
}

export function correoRoomingList(o: {
  contacto: string | null;
  hotel: string;
  camino: string;
  /** "27 de septiembre de 2026" (y check-out si hay). */
  fechas: string;
  referencia: string | null;
  habitaciones: HabitacionRooming[];
  noSeHospedan: string[];
  /** Restricciones alimentarias: [nombre, nota]. */
  dietas: [string, string][];
  /** El hotel también da la cena y todavía falta mandarle el menú. */
  menuPendiente: boolean;
  /** Texto libre extra, opcional. */
  notaExtra?: string | null;
}): Correo {
  const hola = saludo(o.contacto, `equipo de ${o.hotel}`);
  const personas = o.habitaciones.reduce((s, h) => s + h.huespedes.length, 0);
  const partes: string[] = [];
  partes.push(fila(`<p style="${P}">${esc(hola)}</p>`));
  partes.push(fila(`<p style="${P}">Reserva del ${esc(o.fechas)}${o.referencia ? ` (ref. ${esc(o.referencia)})` : ""}. Adjunto el rooming list de <strong>${esc(o.camino)}</strong>: ${o.habitaciones.length} habitaciones, ${personas} personas.</p>`));
  partes.push(fila(tablaRooming(o.hotel, o.habitaciones)));
  if (o.noSeHospedan.length > 0) partes.push(fila(`<p style="${P_MINI}"><strong>No se hospedan esta noche:</strong> ${esc(o.noSeHospedan.join(", "))}.</p>`));
  if (o.dietas.length > 0) {
    partes.push(fila(`<p style="${P_MINI}"><strong>Alimentación:</strong> ${o.dietas.map(([n, d]) => `${esc(n)}: ${esc(d)}`).join(" · ")}.</p>`));
  }
  if (o.notaExtra?.trim()) partes.push(fila(`<p style="${P}">${esc(o.notaExtra.trim()).replace(/\n/g, "<br>")}</p>`));
  if (o.menuPendiente) partes.push(fila(`<p style="${P}">Quedamos pendientes de enviarte la selección de menú de nuestros peregrinos; en cuanto la tenga te la mando.</p>`));
  partes.push(fila(`<p style="${P}">Quedo muy atento.<br>Saludos,</p>${firmaHtml()}<div style="height:18px;"></div>`));

  const subject = `Rooming list · ${o.hotel} · ${o.fechas} · ${CONTACTO.marca}`;
  const text = [
    hola,
    "",
    `Reserva del ${o.fechas}${o.referencia ? ` (ref. ${o.referencia})` : ""}. Adjunto el rooming list de ${o.camino}: ${o.habitaciones.length} habitaciones, ${personas} personas.`,
    "",
    o.hotel.toUpperCase(),
    ...o.habitaciones.flatMap((h) => h.huespedes.map((g, i) => `${i === 0 ? h.nombre.toUpperCase() : "".padEnd(h.nombre.length)}  ${g.nombre}  ${g.pasaporte ?? ""}`)),
    "",
    o.noSeHospedan.length > 0 ? `No se hospedan esta noche: ${o.noSeHospedan.join(", ")}.` : "",
    o.dietas.length > 0 ? `Alimentación: ${o.dietas.map(([n, d]) => `${n}: ${d}`).join(" · ")}.` : "",
    o.notaExtra?.trim() ?? "",
    o.menuPendiente ? "Quedamos pendientes de enviarte la selección de menú de nuestros peregrinos; en cuanto la tenga te la mando." : "",
    "",
    "Quedo muy atento.",
    "Saludos,",
    "",
    firmaTexto(),
  ]
    .filter((l) => l !== "")
    .join("\n");

  return {
    subject,
    html: envolturaCorreo({
      eyebrow: "Rooming list",
      preheader: `Rooming list de ${o.camino} para ${o.hotel}: ${o.habitaciones.length} habitaciones, ${personas} personas.`,
      contenido: partes.join("\n"),
      pie: `${CONTACTO.marca} · ${CONTACTO.correo} · ${CONTACTO.whatsapp}`,
    }),
    text,
  };
}
