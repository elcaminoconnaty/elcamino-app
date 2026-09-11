import { COLOR, CONTACTO, FUENTE_CORREO } from "@/lib/brand";
import { esc } from "@/lib/email/shell";

/**
 * La firma con la que Nico les escribe a hoteles y restaurantes. Es la misma que usa a
 * mano en Gmail, para que el proveedor vea la continuidad dentro del hilo.
 */
export const FIRMA_PROVEEDORES = {
  nombre: "Nicolás Villa Posada",
  marca: CONTACTO.marca,
  sitio: "www.elcaminoconnaty.com",
  ciudad: "Medellín - Colombia",
  celular: "+57 300 491 0929",
} as const;

export function firmaHtml(): string {
  const f = FIRMA_PROVEEDORES;
  return `<p style="margin:22px 0 0;font-family:${FUENTE_CORREO.body};font-size:14px;line-height:1.5;color:${COLOR.noche};">
    <strong>${esc(f.nombre)}</strong><br>
    <em>${esc(f.marca)}</em><br>
    <a href="https://${esc(f.sitio)}" style="color:${COLOR.atlantico};">${esc(f.sitio)}</a><br>
    <em>${esc(f.ciudad)}</em><br>
    Cel.: ${esc(f.celular)}
  </p>`;
}

export function firmaTexto(): string {
  const f = FIRMA_PROVEEDORES;
  return [f.nombre, f.marca, f.sitio, f.ciudad, `Cel.: ${f.celular}`].join("\n");
}
