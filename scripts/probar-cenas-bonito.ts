/**
 * Arma la plantilla de menú de un restaurante real y la lee de vuelta para comprobar el
 * formato: banner, una sección por plato, conteos y su total.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/probar-cenas-bonito.ts [carpeta-destino]
 *
 * Solo lee de la base.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { cargarCenas, cenasDe, libroDeRestaurante, libroCompletoCenas, conteoPorSeccion } from "@/lib/export/cenas";
import { ExcelJS } from "@/lib/export/bonito";

let fallos = 0;
const check = (ok: boolean, m: string) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };

async function main() {
  const supabase = createAdminClient();
  const { data: deps } = await supabase.from("departures").select("id, name").order("start_date");
  let datos: any = null;
  for (const d of deps ?? []) {
    const cargado = await cargarCenas(supabase, d.id);
    if (cargado && cargado.cenas.some((c: any) => conteoPorSeccion(c).length > 0)) { datos = cargado; break; }
  }
  if (!datos) { console.log("Ningún camino tiene cenas con menú elegido."); return; }

  const conMenu = datos.cenas.find((c: any) => conteoPorSeccion(c).length > 0);
  const grupo = cenasDe(datos, { providerId: conMenu.info.provider_id });
  const restaurante = grupo[0].info.provider_name;
  console.log(`Camino:      ${datos.caminoNombre}\nRestaurante: ${restaurante} (${grupo.length} cena/s)\n`);

  const libro = await libroDeRestaurante(datos, grupo);
  if (!libro) { console.log("No se armó el libro."); process.exit(1); }
  check(libro.buffer.length > 3000, `archivo de ${(libro.buffer.length / 1024).toFixed(1)} KB · ${libro.filename}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(libro.buffer as any);
  check(wb.worksheets.length === 2, `pestañas: ${wb.worksheets.map((w) => w.name).join(" | ")}`);
  const ws = wb.worksheets[0];

  const fondo = (c: any) => (c.fill?.type === "pattern" ? c.fill.fgColor?.argb : null);
  check(String(ws.getCell("A1").value).toUpperCase() === String(restaurante).toUpperCase(), `A1 es el restaurante: "${ws.getCell("A1").value}"`);
  check(fondo(ws.getCell("A1")) === "FF3D5A6E", "el banner va en azul atlántico");

  let musgo = 0, totales = 0, cabeceras = 0;
  ws.eachRow((row, n) => {
    const c = ws.getCell(n, 1);
    if (fondo(c) === "FF4A5E47") musgo++;
    if (String(c.value ?? "") === "TOTAL") totales++;
    if (String(c.value ?? "").toUpperCase() === "PLATO") cabeceras++;
  });
  check(musgo > 0, `${musgo} sección(es) de plato en verde musgo`);
  check(cabeceras === musgo, `cada sección tiene su cabecera Plato | Cantidad (${cabeceras})`);
  check(totales === musgo, `cada sección cierra con su TOTAL (${totales})`);

  console.log("\n— Así queda la hoja —");
  ws.eachRow((row, n) => {
    const a = String(ws.getCell(n, 1).value ?? "").replace(/\s+/g, " ").trim();
    const b = String(ws.getCell(n, 2).value ?? "").replace(/\s+/g, " ").trim();
    if (!a && !b) return;
    const f = fondo(ws.getCell(n, 1));
    const marca = f === "FF3D5A6E" ? "██" : f === "FF4A5E47" ? "▒▒" : f === "FFE8D9C0" ? "▓▓" : "  ";
    console.log(`  ${String(n).padStart(2)} ${marca} ${a.slice(0, 52).padEnd(52)} | ${b}`);
  });

  const completo = await libroCompletoCenas(datos);
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(completo.buffer as any);
  console.log(`\n— Libro completo: ${wb2.worksheets.length} pestañas —\n  ${wb2.worksheets.map((w) => w.name).join(" | ")}`);
  check(wb2.worksheets.some((w) => w.name === "Detalle por peregrino"), "la lista nominal tiene su propia hoja");

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
