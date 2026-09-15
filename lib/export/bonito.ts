import "server-only";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { COLOR, CONTACTO, ESTADO } from "@/lib/brand";

/**
 * Excel con la papelería de la marca.
 *
 * `xlsx` (el que usa el resto de exportaciones) no sabe pintar celdas: la versión con
 * estilos es de pago. Para lo que se le manda a un proveedor —que es una carta, no una
 * hoja de cálculo— eso no alcanza, así que esas plantillas van con ExcelJS.
 */

/** Excel quiere ARGB sin `#`; la paleta vive en `lib/brand.ts`. */
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

export const TINTA = {
  atlantico: argb(COLOR.atlantico),
  musgo: argb(COLOR.musgo),
  noche: argb(COLOR.noche),
  alba: argb(COLOR.alba),
  piedra: argb(COLOR.piedra),
  ocre: argb(COLOR.ocre),
  ocreProfundo: argb(COLOR.ocreProfundo),
  castano: argb(COLOR.castano),
  ocreClaro: argb(COLOR.ocreClaro),
  niebla: argb(COLOR.niebla),
  /** Para lo vencido y lo que está frenado: mismo rojo cálido de la paleta de estado. */
  error: argb(ESTADO.error),
  blanco: "FFFFFFFF",
} as const;

/** Arial: la tiene cualquier Excel, en Windows y en Mac, y no se sustituye sola. */
const FUENTE = "Arial";

const relleno = (color: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: color } });
const linea = (color = TINTA.piedra): Partial<ExcelJS.Borders> => ({
  top: { style: "thin", color: { argb: color } },
  left: { style: "thin", color: { argb: color } },
  bottom: { style: "thin", color: { argb: color } },
  right: { style: "thin", color: { argb: color } },
});

export type Celda = ExcelJS.Cell;

/** El banner del encabezado: el nombre del proveedor, que es lo primero que se lee. */
export function titulo(ws: ExcelJS.Worksheet, fila: number, columnas: number, texto: string) {
  ws.mergeCells(fila, 1, fila, columnas);
  const c = ws.getCell(fila, 1);
  c.value = texto.toUpperCase();
  c.font = { name: FUENTE, size: 14, bold: true, color: { argb: TINTA.alba } };
  c.fill = relleno(TINTA.atlantico);
  c.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(fila).height = 30;
}

/** Una línea de contexto bajo el título (camino, fechas, referencia, conteos). */
export function subtitulo(ws: ExcelJS.Worksheet, fila: number, columnas: number, texto: string, fuerte = false) {
  ws.mergeCells(fila, 1, fila, columnas);
  const c = ws.getCell(fila, 1);
  c.value = texto;
  c.font = { name: FUENTE, size: 10, bold: fuerte, color: { argb: fuerte ? TINTA.noche : TINTA.castano } };
  c.fill = relleno(TINTA.alba);
  c.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(fila).height = 18;
}

/** La fila de encabezados de la tabla. */
export function encabezados(ws: ExcelJS.Worksheet, fila: number, textos: string[]) {
  textos.forEach((t, i) => {
    const c = ws.getCell(fila, i + 1);
    c.value = t.toUpperCase();
    c.font = { name: FUENTE, size: 9, bold: true, color: { argb: TINTA.alba } };
    c.fill = relleno(TINTA.atlantico);
    c.alignment = { horizontal: i === 0 ? "left" : "left", vertical: "middle" };
    c.border = linea(TINTA.atlantico);
  });
  ws.getRow(fila).height = 22;
}

/** Una celda de datos, con el filete de siempre. */
export function dato(ws: ExcelJS.Worksheet, fila: number, col: number, valor: any, opciones?: { fuerte?: boolean; centrado?: boolean; fondo?: string; color?: string }) {
  const c = ws.getCell(fila, col);
  c.value = valor ?? "";
  c.font = { name: FUENTE, size: 10, bold: !!opciones?.fuerte, color: { argb: opciones?.color ?? TINTA.noche } };
  c.alignment = { horizontal: opciones?.centrado ? "center" : "left", vertical: "middle", wrapText: true };
  c.border = linea();
  if (opciones?.fondo) c.fill = relleno(opciones.fondo);
  return c;
}

/** Un rótulo de sección dentro de la hoja ("Alimentación", "No se hospedan"). */
export function seccion(
  ws: ExcelJS.Worksheet,
  fila: number,
  columnas: number,
  texto: string,
  estilo?: { fondo?: string; color?: string; centrado?: boolean }
) {
  ws.mergeCells(fila, 1, fila, columnas);
  const c = ws.getCell(fila, 1);
  c.value = texto.toUpperCase();
  c.font = { name: FUENTE, size: 9, bold: true, color: { argb: estilo?.color ?? TINTA.ocreProfundo } };
  c.fill = relleno(estilo?.fondo ?? TINTA.piedra);
  c.alignment = { horizontal: estilo?.centrado ? "center" : "left", vertical: "middle" };
  ws.getRow(fila).height = 20;
}

/** Una fila de texto libre que ocupa toda la hoja (avisos, listas separadas por comas). */
export function parrafo(ws: ExcelJS.Worksheet, fila: number, columnas: number, texto: string) {
  ws.mergeCells(fila, 1, fila, columnas);
  return dato(ws, fila, 1, texto);
}

/** Hoja nueva sin cuadrícula y lista para imprimir en una página de ancho. */
export function hoja(wb: ExcelJS.Workbook, nombre: string, anchos: number[], apaisada = false): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(nombreDeHoja(nombre), {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: apaisada ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });
  ws.columns = anchos.map((w) => ({ width: w }));
  return ws;
}

/** Excel no acepta `\ / ? * [ ]` en el nombre de una pestaña, y la corta en 31. */
export function nombreDeHoja(raw: string, fallback = "Hoja") {
  const limpio = (raw || fallback).replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
  return (limpio || fallback).slice(0, 31);
}

/** Una hoja de datos corriente: cabecera de marca y una fila por registro. */
export function hojaDeDatos(wb: ExcelJS.Workbook, nombre: string, filas: Record<string, any>[], vacio = "Sin datos") {
  if (filas.length === 0) {
    const ws = hoja(wb, nombre, [60]);
    dato(ws, 1, 1, vacio);
    return ws;
  }
  const columnas = Object.keys(filas[0]);
  const anchos = columnas.map((col) => {
    const largo = filas.reduce((max, f) => Math.max(max, String(f[col] ?? "").length), col.length);
    return Math.min(Math.max(largo + 2, 10), 46);
  });
  const ws = hoja(wb, nombre, anchos, true);
  encabezados(ws, 1, columnas);
  filas.forEach((f, i) => {
    columnas.forEach((col, j) => {
      dato(ws, i + 2, j + 1, f[col], { fondo: i % 2 === 1 ? TINTA.alba : undefined });
    });
  });
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 1 }];
  return ws;
}

/** El pie de marca con el que se cierra cada hoja de papelería. */
export function pie(ws: ExcelJS.Worksheet, fila: number, columnas: number) {
  ws.mergeCells(fila, 1, fila, columnas);
  const c = ws.getCell(fila, 1);
  c.value = `${CONTACTO.marca} · ${CONTACTO.sitio}`;
  c.font = { name: FUENTE, size: 8, italic: true, color: { argb: TINTA.castano } };
  c.alignment = { horizontal: "center" };
  return c;
}

export async function libroABuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function respuestaExcel(buffer: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export { ExcelJS };
