import "server-only";
import {
  ExcelJS,
  TINTA,
  dato,
  encabezados,
  hoja,
  hojaDeDatos,
  libroABuffer,
  nombreDeHoja,
  parrafo,
  pie,
  seccion,
  subtitulo,
  titulo,
} from "@/lib/export/bonito";
import type { InformePagos, Giro } from "@/lib/pagos-pendientes/datos";
import { formatDate } from "@/lib/utils";

/**
 * El Excel de pagos a proveedores, con la papelería de la marca.
 *
 * Tres lecturas del mismo dato, porque son tres momentos distintos:
 *   1. **Resumen** — cuánto hay que girar y a quién, antes de sentarse a pagar.
 *   2. **Agenda** — todo junto y ordenado por vencimiento, que es el orden en que se paga.
 *   3. **Una pestaña por proveedor** — sus datos bancarios arriba y sus giros debajo, para
 *      tener delante una sola cosa mientras se hace la transferencia. Es la misma idea de
 *      las hojas de rooming y de cenas: una hoja = un proveedor.
 *
 * Al final quedan las hojas planas (Transferencias, Bizum, Otros medios) que ya existían:
 * ahí cada dato va en su columna porque son las que se copian campo por campo al banco.
 */

const num = (n: number) => Math.round(n * 100) / 100;

/** Excel no sabe de monedas: se le dice el formato y él pone los separadores del sistema. */
const FMT_EUR = '#,##0.00 "€"';
const FMT_COP = '#,##0 "COP"';

const fecha = (d: string | null) => (d ? formatDate(d) : "Sin fecha pactada");

/** Cómo se le paga a este proveedor, en una línea, para el índice del resumen. */
function comoSePaga(g: Giro): string {
  if (g.medio === "transferencia") return g.iban ? `Transferencia · ${g.iban}` : "Transferencia";
  if (g.medio === "bizum") return g.bizum ? `Bizum · ${g.bizum}` : "Bizum";
  return g.medio_label;
}

/**
 * La cuenta por la que cobra un giro. El mismo hotel puede cobrar distinto en dos caminos
 * (lo negocia cada camino por su lado), así que la hoja del proveedor no puede dar por
 * hecho que todos sus giros van al mismo IBAN.
 */
function claveDeCuenta(g: Giro): string {
  return [g.medio ?? "sin-medio", g.iban ?? "", g.bizum ?? "", g.titular ?? "", g.cuenta_alias ?? ""].join("|");
}

/** Los giros de un proveedor, partidos por la cuenta a la que se le gira. */
function porCuenta(giros: Giro[]): Giro[][] {
  const mapa = new Map<string, Giro[]>();
  for (const g of giros) mapa.set(claveDeCuenta(g), [...(mapa.get(claveDeCuenta(g)) ?? []), g]);
  return Array.from(mapa.values());
}

/** Los giros agrupados por proveedor, ordenados por lo que más pesa en plata. */
function porProveedor(giros: Giro[]): { proveedor: string; giros: Giro[]; total: number }[] {
  const mapa = new Map<string, Giro[]>();
  for (const g of giros) {
    const clave = g.proveedor || "Sin proveedor";
    mapa.set(clave, [...(mapa.get(clave) ?? []), g]);
  }
  return Array.from(mapa.entries())
    .map(([proveedor, lista]) => ({
      proveedor,
      // Dentro de cada proveedor manda la fecha: primero lo que vence antes.
      giros: [...lista].sort((a, b) => (a.vence ?? "9999").localeCompare(b.vence ?? "9999")),
      total: lista.reduce((s, g) => s + g.monto_eur, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

// ── Resumen ────────────────────────────────────────────────────────────────

const COLS_RESUMEN = [36, 16, 18, 18, 30];

function hojaResumen(wb: ExcelJS.Workbook, data: InformePagos, grupos: ReturnType<typeof porProveedor>) {
  const cols = COLS_RESUMEN.length;
  const ws = hoja(wb, "Resumen", COLS_RESUMEN);
  const trm = data.trm;
  let f = 1;

  titulo(ws, f++, cols, "Pagos a proveedores");
  subtitulo(ws, f++, cols, data.titulo, true);
  if (data.fechas) subtitulo(ws, f++, cols, data.fechas);
  subtitulo(
    ws,
    f++,
    cols,
    `Generado el ${data.generado} · ${data.giros.length} pago(s) por hacer${trm ? ` · TRM ${Math.round(trm).toLocaleString("es-CO")} COP/€` : ""}`
  );

  /** Una fila etiqueta → importe, que es la forma de todo este resumen. */
  const linea = (etiqueta: string, valor: number | string, opciones?: { fmt?: string; fuerte?: boolean; color?: string; fondo?: string }) => {
    ws.mergeCells(f, 1, f, 3);
    dato(ws, f, 1, etiqueta, { fuerte: opciones?.fuerte, color: opciones?.color, fondo: opciones?.fondo });
    ws.mergeCells(f, 4, f, cols);
    const c = dato(ws, f, 4, valor, { fuerte: opciones?.fuerte, centrado: true, color: opciones?.color, fondo: opciones?.fondo });
    if (typeof valor === "number" && opciones?.fmt) c.numFmt = opciones.fmt;
    f++;
  };

  f++;
  seccion(ws, f++, cols, "Lo que hay que girar", { fondo: TINTA.atlantico, color: TINTA.alba, centrado: true });
  linea("Total a pagar", num(data.totales.saldo_eur), { fmt: FMT_EUR, fuerte: true, fondo: TINTA.alba });
  if (trm) linea("Total a pagar, en pesos", Math.round(data.totales.saldo_eur * trm), { fmt: FMT_COP, fondo: TINTA.alba });
  linea("De eso, ya vencido", num(data.totales.vencido_eur), {
    fmt: FMT_EUR,
    fuerte: data.totales.vencido_eur > 0,
    color: data.totales.vencido_eur > 0 ? TINTA.error : undefined,
  });
  linea("Frenado porque faltan datos", num(data.totales.bloqueado_eur), {
    fmt: FMT_EUR,
    color: data.totales.bloqueado_eur > 0 ? TINTA.ocreProfundo : undefined,
  });

  if (data.porMedio.length > 0) {
    f++;
    seccion(ws, f++, cols, "Por medio de pago", { fondo: TINTA.musgo, color: TINTA.alba, centrado: true });
    for (const m of data.porMedio) linea(`${m.label} · ${m.cantidad} pago(s)`, num(m.total_eur), { fmt: FMT_EUR });
  }

  // El índice: qué proveedor tiene su propia pestaña y por cuánto.
  if (grupos.length > 0) {
    f++;
    seccion(ws, f++, cols, "Por proveedor · cada uno tiene su pestaña", {
      fondo: TINTA.musgo,
      color: TINTA.alba,
      centrado: true,
    });
    const cabecera = ["Proveedor", "Pagos", "Total (€)", "Vencido (€)", "Cómo se le paga"];
    const primera = f;
    encabezados(ws, f++, cabecera);
    grupos.forEach((grupo, i) => {
      const vencido = grupo.giros.filter((g) => g.vencida).reduce((s, g) => s + g.monto_eur, 0);
      const falta = grupo.giros.some((g) => g.faltan.length > 0);
      const fondo = i % 2 === 1 ? TINTA.alba : undefined;
      dato(ws, f, 1, grupo.proveedor, { fuerte: true, fondo });
      dato(ws, f, 2, grupo.giros.length, { centrado: true, fondo });
      dato(ws, f, 3, num(grupo.total), { centrado: true, fondo }).numFmt = FMT_EUR;
      const cv = dato(ws, f, 4, vencido > 0 ? num(vencido) : "", {
        centrado: true,
        fondo,
        color: vencido > 0 ? TINTA.error : undefined,
        fuerte: vencido > 0,
      });
      if (vencido > 0) cv.numFmt = FMT_EUR;
      const cuentas = porCuenta(grupo.giros);
      dato(
        ws,
        f,
        5,
        falta
          ? `⚠ falta ${grupo.giros.flatMap((g) => g.faltan)[0]}`
          : cuentas.length > 1
            ? `${cuentas.length} cuentas distintas · ver pestaña`
            : comoSePaga(grupo.giros[0]),
        { fondo, color: falta ? TINTA.ocreProfundo : undefined }
      );
      f++;
    });
    ws.pageSetup.printTitlesRow = `${primera}:${primera}`;
  }

  if (data.avisos.length > 0) {
    f++;
    seccion(ws, f++, cols, "Revisar", { fondo: TINTA.ocre, color: TINTA.noche, centrado: true });
    for (const a of data.avisos) parrafo(ws, f++, cols, a);
  }

  f += 2;
  pie(ws, f, cols);
  return ws;
}

// ── Agenda: todos los giros, en el orden en que se pagan ───────────────────

function hojaAgenda(wb: ExcelJS.Workbook, data: InformePagos, unSoloCamino: boolean) {
  const cabecera = unSoloCamino
    ? ["Vence", "Proveedor", "Servicio", "Concepto", "Medio", "Importe (€)", "Sale de", "Estado"]
    : ["Vence", "Camino", "Proveedor", "Servicio", "Concepto", "Medio", "Importe (€)", "Sale de", "Estado"];
  const anchos = unSoloCamino ? [16, 28, 28, 24, 18, 16, 20, 22] : [16, 24, 26, 26, 22, 16, 16, 18, 22];
  const ws = hoja(wb, "Agenda de pagos", anchos, true);
  const cols = cabecera.length;
  let f = 1;

  titulo(ws, f++, cols, "Agenda de pagos");
  subtitulo(ws, f++, cols, data.titulo, true);
  subtitulo(ws, f++, cols, `Ordenada por vencimiento · generada el ${data.generado}`);
  f++;

  const primera = f;
  encabezados(ws, f++, cabecera);

  // Lo sin fecha pactada al final: no tiene plazo, no manda el orden.
  const ordenados = [...data.giros].sort((a, b) => (a.vence ?? "9999").localeCompare(b.vence ?? "9999"));
  if (ordenados.length === 0) {
    parrafo(ws, f++, cols, "No hay nada pendiente de pagar. Vale la pena celebrarlo.");
  }

  ordenados.forEach((g, i) => {
    const fondo = g.vencida ? TINTA.piedra : i % 2 === 1 ? TINTA.alba : undefined;
    const color = g.vencida ? TINTA.error : undefined;
    const celdas: (string | number)[] = unSoloCamino
      ? [fecha(g.vence), g.proveedor, g.servicio, g.concepto, g.medio_label, num(g.monto_eur), g.cuenta_origen ?? "", ""]
      : [fecha(g.vence), g.camino, g.proveedor, g.servicio, g.concepto, g.medio_label, num(g.monto_eur), g.cuenta_origen ?? "", ""];
    const iImporte = unSoloCamino ? 6 : 7;
    const iEstado = cols;
    celdas[iEstado - 1] = g.faltan.length > 0 ? `Falta ${g.faltan.join(", ")}` : g.vencida ? "VENCIDA" : "";
    celdas.forEach((v, j) => {
      const c = dato(ws, f, j + 1, v, {
        fondo,
        color: j + 1 === iEstado && g.faltan.length > 0 ? TINTA.ocreProfundo : color,
        fuerte: g.vencida && (j + 1 === iImporte || j + 1 === iEstado),
        centrado: j + 1 === iImporte,
      });
      if (j + 1 === iImporte) c.numFmt = FMT_EUR;
    });
    f++;
  });

  if (ordenados.length > 0) {
    const total = ordenados.reduce((s, g) => s + g.monto_eur, 0);
    const iImporte = unSoloCamino ? 6 : 7;
    ws.mergeCells(f, 1, f, iImporte - 1);
    dato(ws, f, 1, "TOTAL", { fuerte: true, fondo: TINTA.piedra, color: TINTA.ocreProfundo });
    dato(ws, f, iImporte, num(total), { fuerte: true, centrado: true, fondo: TINTA.piedra }).numFmt = FMT_EUR;
    ws.mergeCells(f, iImporte + 1, f, cols);
    dato(ws, f, iImporte + 1, "", { fondo: TINTA.piedra });
    f++;
  }

  ws.pageSetup.printTitlesRow = `${primera}:${primera}`;
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: primera }];

  f += 2;
  pie(ws, f, cols);
  return ws;
}

// ── Una pestaña por proveedor ──────────────────────────────────────────────

/** Con un solo camino sobra la columna que lo nombra; con varios, es lo que ubica el giro. */
const COLS_PROVEEDOR = (unSoloCamino: boolean) =>
  unSoloCamino ? ["Vence", "Concepto", "Servicio", "Importe (€)"] : ["Vence", "Camino", "Concepto", "Servicio", "Importe (€)"];
const ANCHOS_PROVEEDOR = (unSoloCamino: boolean) => (unSoloCamino ? [18, 30, 34, 18] : [18, 26, 26, 28, 16]);

function hojaDeProveedor(
  wb: ExcelJS.Workbook,
  grupo: { proveedor: string; giros: Giro[]; total: number },
  data: InformePagos,
  unSoloCamino: boolean,
  nombreHoja: string
) {
  const columnas = COLS_PROVEEDOR(unSoloCamino);
  const cols = columnas.length;
  const ws = hoja(wb, nombreHoja, ANCHOS_PROVEEDOR(unSoloCamino));
  let f = 1;

  // ── Encabezado ───────────────────────────────────────────────────────────
  titulo(ws, f++, cols, grupo.proveedor);
  subtitulo(ws, f++, cols, unSoloCamino ? data.titulo : Array.from(new Set(grupo.giros.map((g) => g.camino))).join(" · "), true);
  const vencido = grupo.giros.filter((g) => g.vencida).reduce((s, g) => s + g.monto_eur, 0);
  subtitulo(
    ws,
    f++,
    cols,
    `${grupo.giros.length} pago(s) por hacer · ${grupo.total.toFixed(2)} €${vencido > 0 ? ` · ${vencido.toFixed(2)} € ya vencidos` : ""}`
  );

  // ── Un bloque por cuenta: los datos del giro y, debajo, lo que se gira ahí ─
  const cuentas = porCuenta(grupo.giros).sort(
    (a, b) => b.reduce((s, g) => s + g.monto_eur, 0) - a.reduce((s, g) => s + g.monto_eur, 0)
  );
  let primeraCabecera = 0;

  const campo = (etiqueta: string, valor: string | null | undefined) => {
    if (!valor) return;
    dato(ws, f, 1, etiqueta, { fuerte: true, color: TINTA.castano, fondo: TINTA.alba });
    ws.mergeCells(f, 2, f, cols);
    dato(ws, f, 2, valor);
    f++;
  };

  for (const cuenta of cuentas) {
    const c0 = cuenta[0];
    const totalCuenta = cuenta.reduce((s, g) => s + g.monto_eur, 0);

    f++;
    const rotulo = `Cómo se le paga · ${c0.medio_label}${cuentas.length > 1 && c0.cuenta_alias ? ` · ${c0.cuenta_alias}` : ""}`;
    seccion(ws, f++, cols, rotulo, { fondo: TINTA.atlantico, color: TINTA.alba, centrado: true });

    campo("Titular", c0.titular);
    campo("NIF", c0.nif);
    if (c0.medio === "transferencia") {
      campo("Banco", c0.banco);
      campo("IBAN", c0.iban);
      campo("SWIFT / BIC", c0.swift);
    }
    if (c0.medio === "bizum") campo("Teléfono Bizum", c0.bizum);
    if (c0.moneda && c0.moneda !== "EUR") {
      const enMoneda = cuenta.reduce((s, g) => s + (g.monto_moneda ?? 0), 0);
      campo("Moneda", enMoneda > 0 ? `${c0.moneda} · ${enMoneda.toFixed(2)} ${c0.moneda} en total` : c0.moneda);
    }
    campo("Cuenta desde la que sale", c0.cuenta_origen);
    campo("Concepto / referencia", c0.referencia);
    campo("Condición pactada", c0.condicion);
    if (data.trm) campo("Equivalente en pesos", `${Math.round(totalCuenta * data.trm).toLocaleString("es-CO")} COP`);

    f++;
    seccion(ws, f++, cols, "Pagos pendientes", { fondo: TINTA.musgo, color: TINTA.alba, centrado: true });
    if (primeraCabecera === 0) primeraCabecera = f;
    encabezados(ws, f++, columnas);

    for (const g of cuenta) {
      const fondo = g.vencida ? TINTA.piedra : undefined;
      const color = g.vencida ? TINTA.error : undefined;
      let c = 1;
      dato(ws, f, c++, fecha(g.vence), { fondo, color, fuerte: g.vencida });
      if (!unSoloCamino) dato(ws, f, c++, g.camino, { fondo, color });
      dato(ws, f, c++, g.vencida ? `${g.concepto} · VENCIDA` : g.concepto, { fondo, color });
      dato(ws, f, c++, g.servicio, { fondo, color });
      dato(ws, f, c, num(g.monto_eur), { centrado: true, fondo, color, fuerte: true }).numFmt = FMT_EUR;
      f++;
    }

    // Con una sola cuenta este total ya es el del proveedor; con varias, el de este bloque.
    ws.mergeCells(f, 1, f, cols - 1);
    dato(ws, f, 1, cuentas.length > 1 ? "Total de esta cuenta" : "TOTAL A GIRAR", {
      fuerte: true,
      fondo: TINTA.piedra,
      color: TINTA.ocreProfundo,
    });
    dato(ws, f, cols, num(totalCuenta), { fuerte: true, centrado: true, fondo: TINTA.piedra, color: TINTA.ocreProfundo }).numFmt = FMT_EUR;
    f++;
  }

  if (cuentas.length > 1) {
    f++;
    ws.mergeCells(f, 1, f, cols - 1);
    dato(ws, f, 1, "TOTAL A GIRAR", { fuerte: true, fondo: TINTA.atlantico, color: TINTA.alba });
    dato(ws, f, cols, num(grupo.total), { fuerte: true, centrado: true, fondo: TINTA.atlantico, color: TINTA.alba }).numFmt = FMT_EUR;
    f++;
  }

  if (primeraCabecera > 0) ws.pageSetup.printTitlesRow = `${primeraCabecera}:${primeraCabecera}`;

  // ── Lo que impide pagar, bien visible ────────────────────────────────────
  const faltan = Array.from(new Set(grupo.giros.flatMap((g) => g.faltan)));
  if (faltan.length > 0) {
    f++;
    seccion(ws, f++, cols, "Todavía no se puede girar", { fondo: TINTA.ocre, color: TINTA.noche, centrado: true });
    parrafo(ws, f++, cols, `Falta: ${faltan.join(", ")}.`);
    parrafo(ws, f++, cols, "Se arregla en la ficha del proveedor → Cómo se le paga, o en la reserva → Cómo se paga.");
  }

  const notas = Array.from(new Set(grupo.giros.map((g) => g.notas).filter(Boolean))) as string[];
  if (notas.length > 0) {
    f++;
    seccion(ws, f++, cols, "Notas de la cuenta");
    for (const n of notas) parrafo(ws, f++, cols, n);
  }

  f += 2;
  pie(ws, f, cols);
  return ws;
}

// ── Las hojas planas, para copiar campo por campo al banco ─────────────────

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
    "NIF": g.nif ?? "",
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
    "NIF": g.nif ?? "",
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
    "NIF": g.nif ?? "",
    "CONDICIÓN PACTADA": g.condicion ?? "",
    "NOTAS": g.notas ?? "",
    "FALTA": g.faltan.join(", "),
  };
}

// ── El libro ───────────────────────────────────────────────────────────────

/** Los nombres que ya usa el libro; ninguna pestaña de proveedor puede pisarlos. */
const RESERVADOS = ["Resumen", "Agenda de pagos", "Transferencias", "Bizum", "Otros medios", "Faltan datos", "Otros del presupuesto"];

export async function construirExcelPagos(data: InformePagos): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const trm = data.trm;
  const unSoloCamino = new Set(data.giros.map((g) => g.camino)).size <= 1;
  const grupos = porProveedor(data.giros);

  hojaResumen(wb, data, grupos);
  hojaAgenda(wb, data, unSoloCamino);

  // Una pestaña por proveedor, de mayor a menor deuda.
  const usadas = new Map<string, number>(RESERVADOS.map((n) => [nombreDeHoja(n), 1]));
  for (const grupo of grupos) {
    const base = nombreDeHoja(grupo.proveedor || "Proveedor");
    const n = (usadas.get(base) ?? 0) + 1;
    usadas.set(base, n);
    hojaDeProveedor(wb, grupo, data, unSoloCamino, n > 1 ? nombreDeHoja(`${base} ${n}`) : base);
  }

  const transferencias = data.giros.filter((g) => g.medio === "transferencia");
  const bizums = data.giros.filter((g) => g.medio === "bizum");
  const otrosMedios = data.giros.filter((g) => g.medio !== "transferencia" && g.medio !== "bizum");

  hojaDeDatos(wb, "Transferencias", transferencias.map((g) => filaTransferencia(g, trm)), "No hay transferencias pendientes.");
  hojaDeDatos(wb, "Bizum", bizums.map((g) => filaBizum(g, trm)), "No hay pagos por Bizum pendientes.");
  hojaDeDatos(wb, "Otros medios", otrosMedios.map((g) => filaOtro(g, trm)), "Nada por tarjeta, efectivo ni plataforma.");

  // Lo que no se puede pagar todavía, junto y a la vista.
  const incompletos = data.giros.filter((g) => g.faltan.length > 0);
  hojaDeDatos(
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

  hojaDeDatos(
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

  return libroABuffer(wb);
}
