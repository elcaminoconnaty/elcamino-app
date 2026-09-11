import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { appendSheet, xlsxResponse, fileSlug } from "@/lib/export";
import { armarInformePagos } from "@/lib/pagos-pendientes/datos";

export const dynamic = "force-dynamic";

/** El informe de pagos pendientes en Excel, con las columnas de la hoja que Naty llevaba a mano. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const data = await armarInformePagos(supabase, params.id);
  if (!data) return NextResponse.json({ error: "Camino no encontrado" }, { status: 404 });

  const wb = XLSX.utils.book_new();
  const filas = data.filas.map((f) => ({
    "PROVEEDOR": f.proveedor,
    "SERVICIO": f.servicio,
    "FECHA": f.fecha ?? "",
    "ESTADO": f.estado,
    "VALOR TOTAL (€)": f.total_eur,
    "VALOR TOTAL (COP)": data.trm ? Math.round(f.total_eur * data.trm) : "",
    "PAGADO (€)": f.pagado_eur,
    "SALDO (€)": f.saldo_eur,
    "SALDO (COP)": data.trm ? Math.round(f.saldo_eur * data.trm) : "",
    "MEDIO DE PAGO": f.medio_label,
    "CUENTA ORIGEN": f.cuenta_origen ?? "",
    "DATOS DE PAGO": f.datos_pago.join(" · "),
    "PRÓXIMA CUOTA": f.proxima_cuota ? `${f.proxima_cuota.fecha} · ${f.proxima_cuota.monto_eur} €${f.proxima_cuota.label ? ` · ${f.proxima_cuota.label}` : ""}${f.proxima_cuota.vencida ? " · VENCIDA" : ""}` : "Sin plan",
    "CUOTAS PENDIENTES": f.cuotas.map((c) => `${c.fecha}: ${c.monto_eur} €`).join(" | "),
  }));
  filas.push({
    "PROVEEDOR": "TOTAL",
    "SERVICIO": "",
    "FECHA": "",
    "ESTADO": "",
    "VALOR TOTAL (€)": data.totales.total_eur,
    "VALOR TOTAL (COP)": data.trm ? Math.round(data.totales.total_eur * data.trm) : "",
    "PAGADO (€)": data.totales.pagado_eur,
    "SALDO (€)": data.filas.reduce((s, f) => s + f.saldo_eur, 0),
    "SALDO (COP)": data.trm ? Math.round(data.filas.reduce((s, f) => s + f.saldo_eur, 0) * data.trm) : "",
    "MEDIO DE PAGO": "",
    "CUENTA ORIGEN": "",
    "DATOS DE PAGO": data.trm ? `TRM de referencia: ${data.trm} COP/EUR` : "",
    "PRÓXIMA CUOTA": "",
    "CUOTAS PENDIENTES": "",
  });
  appendSheet(wb, "Pagos pendientes", filas, "No hay reservas con saldo pendiente.");

  appendSheet(
    wb,
    "Otros del presupuesto",
    data.otros.map((o) => ({ "ÍTEM": o.descripcion, "CATEGORÍA": o.categoria, "TOTAL (€)": o.total_eur, "PAGADO (€)": o.pagado_eur, "SALDO (€)": o.saldo_eur })),
    "Sin pendientes del presupuesto fuera de reservas."
  );

  return xlsxResponse(wb, `pagos-pendientes-${fileSlug(data.camino)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
