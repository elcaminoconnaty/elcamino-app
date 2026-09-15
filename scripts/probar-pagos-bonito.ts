/**
 * Arma el informe de pagos a proveedores de un camino real y lo lee de vuelta para
 * comprobar que quedó con la papelería: banner, resumen, agenda y una pestaña por proveedor.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/probar-pagos-bonito.ts [carpeta-destino]
 *
 * El informe siempre sale por camino: no hay descarga con todos los caminos mezclados.
 * Solo lee de la base. Si le pasás una carpeta, deja ahí el .xlsx para abrirlo.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarInformePagos } from "@/lib/pagos-pendientes/datos";
import { construirExcelPagos } from "@/lib/pagos-pendientes/excel";
import { ExcelJS, nombreDeHoja } from "@/lib/export/bonito";

let fallos = 0;
const check = (ok: boolean, m: string) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };

async function main() {
  const supabase = createAdminClient();

  // El primer camino que tenga algo por pagar: es el informe tal como se baja de la app.
  const { data: deps } = await supabase.from("departures").select("id, name").order("start_date");
  let data: Awaited<ReturnType<typeof armarInformePagos>> = null;
  for (const d of deps ?? []) {
    const uno = await armarInformePagos(supabase, { departureId: d.id, hasta: null });
    if (uno && uno.giros.length > 0) { data = uno; break; }
  }
  if (!data) { console.log("Ningún camino tiene pagos pendientes."); return; }

  const proveedores = Array.from(new Set(data.giros.map((g) => g.proveedor)));
  console.log(`Camino: ${data.titulo}\nGiros:  ${data.giros.length} · ${proveedores.length} proveedor(es)\n`);

  const buffer = await construirExcelPagos(data);
  check(buffer.length > 3000, `archivo de ${(buffer.length / 1024).toFixed(1)} KB`);

  // Leerlo de vuelta: lo que importa es lo que quedó escrito, no lo que creíamos escribir.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const nombres = wb.worksheets.map((w) => w.name);
  console.log(`  pestañas: ${nombres.join(" | ")}\n`);

  const fondo = (c: any) => (c.fill?.type === "pattern" ? c.fill.fgColor?.argb : null);
  const resumen = wb.getWorksheet("Resumen")!;
  const a1 = resumen.getCell("A1");
  check(String(a1.value).toUpperCase() === "PAGOS A PROVEEDORES", `A1 es el banner: "${a1.value}"`);
  check(fondo(a1) === "FF3D5A6E", `el banner va en azul atlántico (${fondo(a1)})`);
  check((a1.font as any)?.color?.argb === "FFF5EEE3", "el texto del banner va en alba");
  check(String(resumen.getCell("A2").value) === data.titulo, `bajo el banner va el camino: "${resumen.getCell("A2").value}"`);
  check(!resumen.views?.[0]?.showGridLines, "sin cuadrícula, como la papelería");
  check(nombres[0] === "Resumen" && nombres[1] === "Agenda de pagos", "el libro abre en Resumen y luego la Agenda");

  // Una pestaña por proveedor, con su nombre.
  const faltantes = proveedores.filter((p) => !nombres.some((n) => n === nombreDeHoja(p) || n.startsWith(nombreDeHoja(p))));
  check(faltantes.length === 0, `hay pestaña para cada proveedor${faltantes.length ? `: falta ${faltantes.join(", ")}` : ""}`);

  const ws = wb.getWorksheet(nombreDeHoja(proveedores[0]))!;
  check(!!ws, `la pestaña "${nombreDeHoja(proveedores[0])}" existe`);
  check(String(ws.getCell("A1").value ?? "").toUpperCase() === proveedores[0].toUpperCase(), `su A1 es el proveedor: "${ws.getCell("A1").value}"`);

  let filaComo = 0, filaPagos = 0, filaTotal = 0, filaCabecera = 0;
  ws.eachRow((row, n) => {
    const v = String(row.getCell(1).value ?? "").toUpperCase();
    if (v.startsWith("CÓMO SE LE PAGA")) filaComo = filaComo || n;
    if (v === "PAGOS PENDIENTES") filaPagos = filaPagos || n;
    if (v === "VENCE") filaCabecera = filaCabecera || n;
    if (v === "TOTAL A GIRAR") filaTotal = n;
  });
  check(filaComo > 0, `el bloque "Cómo se le paga" está en la fila ${filaComo}`);
  check(filaPagos > filaComo, `la tabla de pagos va debajo (fila ${filaPagos})`);
  check(filaTotal > filaPagos, `cierra con el total a girar (fila ${filaTotal})`);

  // Un informe de un solo camino no repite el nombre del camino en cada fila.
  const cabecera = [1, 2, 3, 4].map((c) => String(ws.getCell(filaCabecera, c).value ?? "").toUpperCase());
  check(!cabecera.includes("CAMINO"), `sin columna Camino, que acá sobra: ${cabecera.join(" · ")}`);

  const total = ws.getCell(filaTotal, ws.columnCount);
  check(typeof total.value === "number", `el total es un número (${total.value})`);
  check(String(total.numFmt ?? "").includes("€"), `y lleva formato de euros (${total.numFmt})`);
  const suma = data.giros.filter((g) => g.proveedor === proveedores[0]).reduce((s, g) => s + g.monto_eur, 0);
  check(Math.abs(Number(total.value) - Math.round(suma * 100) / 100) < 0.02, `y cuadra con los giros (${suma.toFixed(2)} €)`);

  const pies: string[] = [];
  ws.eachRow((row) => { const v = String(row.getCell(1).value ?? ""); if (v.includes("elcaminoconnaty.com")) pies.push(v); });
  check(pies.length === 1, `cierra con el pie de marca: "${pies[0] ?? "—"}"`);

  const destino = process.argv[2];
  if (destino) {
    const ruta = join(destino, "pagos-proveedores-prueba.xlsx");
    writeFileSync(ruta, buffer);
    console.log(`\n  archivo en ${ruta}`);
  }

  console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} comprobación(es) fallaron.`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
