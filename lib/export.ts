import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

/** Quita tildes y caracteres que Excel no acepta en el nombre de una hoja (máx. 31). */
export function sheetName(raw: string, fallback = "Hoja") {
  const clean = (raw || fallback).replace(/[\\/?*\[\]:]/g, " ").trim();
  return (clean || fallback).slice(0, 31);
}

/** Nombre de archivo seguro: sin acentos, espacios ni comillas que rompan el header. */
export function fileSlug(raw: string) {
  return (raw || "export")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

/** Ancho de columna por contenido, con tope para que no se desborde. */
function autoWidths(rows: Record<string, any>[]) {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).map((key) => {
    const largest = rows.reduce((max, r) => Math.max(max, String(r[key] ?? "").length), key.length);
    return { wch: Math.min(Math.max(largest + 2, 10), 46) };
  });
}

export function appendSheet(wb: XLSX.WorkBook, name: string, rows: Record<string, any>[], empty = "Sin datos") {
  if (rows.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([[empty]]);
    ws["!cols"] = [{ wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName(name));
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = autoWidths(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName(name));
}

export function xlsxResponse(wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
