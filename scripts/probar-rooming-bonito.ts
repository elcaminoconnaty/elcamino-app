/**
 * Arma la plantilla de rooming de un hotel real y la lee de vuelta para comprobar que
 * quedó con el formato: banner, cabeceras, la habitación combinada sobre sus huéspedes.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/probar-rooming-bonito.ts [carpeta-destino]
 *
 * Solo lee de la base. Si le pasás una carpeta, deja ahí el .xlsx para abrirlo.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { cargarRooming, filasDe, libroDeHotel, libroCompleto } from "@/lib/export/rooming";
import { ExcelJS } from "@/lib/export/bonito";

let fallos = 0;
const check = (ok: boolean, m: string) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };

async function main() {
  const supabase = createAdminClient();
  const { data: deps } = await supabase.from("departures").select("id, name").order("start_date");
  let datos: any = null;
  for (const d of deps ?? []) {
    const cargado = await cargarRooming(supabase, d.id);
    if (cargado && cargado.rows.length > 0) { datos = cargado; break; }
  }
  if (!datos) { console.log("Ningún camino tiene habitaciones cargadas."); return; }

  const hotelId = datos.rows[0].provider_id;
  const filas = filasDe(datos, { hotelId });
  const hotel = filas[0].provider_name;
  console.log(`Camino: ${datos.caminoNombre}\nHotel:  ${hotel} (${filas.length} filas)\n`);

  const libro = await libroDeHotel(datos, filas);
  if (!libro) { console.log("No se armó el libro."); process.exit(1); }
  check(libro.buffer.length > 3000, `archivo de ${(libro.buffer.length / 1024).toFixed(1)} KB · ${libro.filename}`);

  // Leerlo de vuelta: lo que importa es lo que quedó escrito, no lo que creíamos escribir.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(libro.buffer as any);
  const ws = wb.worksheets[0];
  check(wb.worksheets.length === 1, `una sola pestaña, llamada "${ws.name}"`);

  const fondo = (c: any) => (c.fill?.type === "pattern" ? c.fill.fgColor?.argb : null);
  const a1 = ws.getCell("A1");
  check(String(a1.value).toUpperCase() === String(hotel).toUpperCase(), `A1 es el nombre del hotel en mayúscula: "${a1.value}"`);
  check(fondo(a1) === "FF3D5A6E", `el banner va en azul atlántico (${fondo(a1)})`);
  check((a1.font as any)?.color?.argb === "FFF5EEE3", "el texto del banner va en alba");

  const merges: string[] = (ws as any).model?.merges ?? [];
  check(merges.some((m) => m.startsWith("A1:")), `el banner ocupa las tres columnas (${merges[0]})`);

  // La fila de encabezados y las habitaciones combinadas.
  let filaCabecera = 0;
  ws.eachRow((row, n) => { if (String(row.getCell(1).value ?? "").toUpperCase() === "HABITACIÓN") filaCabecera = n; });
  check(filaCabecera > 0, `la cabecera de la tabla está en la fila ${filaCabecera}`);
  check(String(ws.getCell(filaCabecera, 2).value).toUpperCase() === "HUÉSPED", "columna 2: Huésped");
  check(String(ws.getCell(filaCabecera, 3).value).toUpperCase() === "PASAPORTE", "columna 3: Pasaporte");

  const combinadasHab = merges.filter((m) => /^A(\d+):A(\d+)$/.test(m) && Number(m.split(":")[0].slice(1)) > filaCabecera);
  check(combinadasHab.length > 0, `${combinadasHab.length} habitación(es) combinada(s) sobre sus huéspedes: ${combinadasHab.slice(0, 3).join(", ")}`);

  console.log("\n— Así queda la hoja —");
  ws.eachRow((row, n) => {
    const celdas = [1, 2, 3].map((c) => String(ws.getCell(n, c).value ?? "").replace(/\s+/g, " ").trim());
    if (celdas.every((v) => !v)) return;
    const marca = fondo(ws.getCell(n, 1)) === "FF3D5A6E" ? "██" : fondo(ws.getCell(n, 1)) === "FFE8D9C0" ? "▓▓" : "  ";
    console.log(`  ${String(n).padStart(2)} ${marca} ${celdas[0].padEnd(20)} | ${celdas[1].padEnd(34)} | ${celdas[2]}`);
  });

  const completo = await libroCompleto(datos);
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(completo.buffer as any);
  console.log(`\n— Libro completo del camino: ${wb2.worksheets.length} pestañas —`);
  console.log(`  ${wb2.worksheets.map((w) => w.name).join(" | ")}`);
  check(wb2.worksheets.some((w) => w.name === "Resumen"), "tiene la hoja Resumen");
  check(wb2.worksheets.some((w) => w.name === "Matriz por peregrino"), "tiene la matriz por peregrino");

  const destino = process.argv[2];
  if (destino) {
    writeFileSync(`${destino}/${libro.filename}`, libro.buffer);
    writeFileSync(`${destino}/${completo.filename}`, completo.buffer);
    console.log(`\n  guardados en ${destino}`);
  }

  console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
  process.exit(fallos ? 1 : 0);
}

main();
