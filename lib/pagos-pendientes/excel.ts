import "server-only";
import * as XLSX from "xlsx";
import { appendSheet } from "@/lib/export";
import type { InformePagos, Giro } from "@/lib/pagos-pendientes/datos";

/**
 * El Excel de pagos a proveedores, partido por medio de pago.
 *
 * La hoja de transferencias lleva cada dato en su propia columna — titular, IBAN, SWIFT,
 * importe, concepto — porque es lo que el banco pide campo por campo. Una columna
 * "datos de pago" con todo junto obliga a separarlo a mano, que es justo lo que este
 * informe viene a evitar.
 */

const num = (n: number) => Math.round(n * 100) / 100;

function comunes(g: Giro, trm: number | null) {
  return {
    "CAMINO": g.camino,
    "PROVEEDOR": g.proveedor,
    "SERVICIO": g.servicio,
    "FECHA SERVICIO": g.fecha_servicio ?? "",
    "CONCEPTO DEL PAGO": g.concepto,
    "VENCE": g.vence ?? "Sin fecha pactada",
    "ESTADO": g.vencida ? "VENCIDA" : "",
    "IMPORTE (€)": num(g.monto_eur),
    "IMPORTE (COP)": trm ? Math.round(g.monto_eur * trm) : "",
  };
}

function filaTransferencia(g: Giro, trm: number | null) {
  return {
    ...comunes(g, trm),
    "TITULAR": g.titular ?? "",
    "IBAN": g.iban ?? "",
    "SWIFT / BIC": g.swift ?? "",
    "BANCO": g.banco ?? "",
    "MONEDA": g.moneda,
    "IMPORTE EN MONEDA": g.monto_moneda != null ? num(g.monto_moneda) : "",
    "CONCEPTO / REFERENCIA": g.referencia ?? "",
    "SALE DE": g.cuenta_origen ?? "",
    "CONDICIÓN PACTADA": g.condicion ?? "",
    "NOTAS": g.notas ?? "",
    "FALTA": g.faltan.join(", "),
  };
}

function filaBizum(g: Giro, trm: number | null) {
  return {
    ...comunes(g, trm),
    "TELÉFONO BIZUM": g.bizum ?? "",
    "A NOMBRE DE": g.titular ?? "",
    "CONCEPTO / REFERENCIA": g.referencia ?? "",
    "SALE DE": g.cuenta_origen ?? "",
    "NOTAS": g.notas ?? "",
    "FALTA": g.faltan.join(", "),
  };
}

function filaOtro(g: Giro, trm: number | null) {
  return {
    ...comunes(g, trm),
    "MEDIO": g.medio_label,
    "DÓNDE / A NOMBRE DE": g.titular ?? g.cuenta_alias ?? "",
    "CONDICIÓN PACTADA": g.condicion ?? "",
    "NOTAS": g.notas ?? "",
    "FALTA": g.faltan.join(", "),
  };
}

export function construirExcelPagos(data: InformePagos): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const trm = data.trm;

  const transferencias = data.giros.filter((g) => g.medio === "transferencia");
  const bizums = data.giros.filter((g) => g.medio === "bizum");
  const otrosMedios = data.giros.filter((g) => g.medio !== "transferencia" && g.medio !== "bizum");

  // Resumen primero: es lo que se mira antes de sentarse a girar.
  const resumen: Record<string, any>[] = [
    { "CONCEPTO": "Informe", "VALOR": data.titulo },
    { "CONCEPTO": "Generado", "VALOR": data.generado },
    { "CONCEPTO": "Pagos por hacer", "VALOR": data.giros.length },
    { "CONCEPTO": "Total a pagar (€)", "VALOR": num(data.totales.saldo_eur) },
    ...(trm ? [{ "CONCEPTO": "Total a pagar (COP)", "VALOR": Math.round(data.totales.saldo_eur * trm) }] : []),
    { "CONCEPTO": "De eso, ya vencido (€)", "VALOR": num(data.totales.vencido_eur) },
    { "CONCEPTO": "Frenado por datos faltantes (€)", "VALOR": num(data.totales.bloqueado_eur) },
    ...(trm ? [{ "CONCEPTO": "TRM de referencia (COP/EUR)", "VALOR": trm }] : []),
    { "CONCEPTO": "", "VALOR": "" },
    ...data.porMedio.map((m) => ({ "CONCEPTO": `${m.label} — ${m.cantidad} pago(s)`, "VALOR": num(m.total_eur) })),
  ];
  appendSheet(wb, "Resumen", resumen);

  appendSheet(
    wb,
    "Transferencias",
    transferencias.map((g) => filaTransferencia(g, trm)),
    "No hay transferencias pendientes."
  );
  appendSheet(wb, "Bizum", bizums.map((g) => filaBizum(g, trm)), "No hay pagos por Bizum pendientes.");
  appendSheet(
    wb,
    "Otros medios",
    otrosMedios.map((g) => filaOtro(g, trm)),
    "Nada por tarjeta, efectivo ni plataforma."
  );

  // Lo que no se puede pagar todavía, junto y a la vista.
  const incompletos = data.giros.filter((g) => g.faltan.length > 0);
  appendSheet(
    wb,
    "Faltan datos",
    incompletos.map((g) => ({
      "PROVEEDOR": g.proveedor,
      "CAMINO": g.camino,
      "SERVICIO": g.servicio,
      "IMPORTE (€)": num(g.monto_eur),
      "QUÉ FALTA": g.faltan.join(", "),
      "DÓNDE SE ARREGLA": "Ficha del proveedor → Cómo se le paga, o la reserva → Cómo se paga",
    })),
    "Todos los pagos tienen sus datos completos."
  );

  appendSheet(
    wb,
    "Otros del presupuesto",
    data.otros.map((o) => ({
      "ÍTEM": o.descripcion,
      "CATEGORÍA": o.categoria,
      "TOTAL (€)": num(o.total_eur),
      "PAGADO (€)": num(o.pagado_eur),
      "SALDO (€)": num(o.saldo_eur),
    })),
    "Sin pendientes del presupuesto fuera de reservas."
  );

  return wb;
}
