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
import { cargarRooming, filasDe, libroDeHotel, libroCompleto, porNoche } from "@/lib/export/rooming";
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

  // ── Un hotel con varias noches: cada una con su tabla ────────────────────
  // Es el caso del Araguaney en Santiago: dos noches seguidas y la gente cambia de una a
  // otra. Con todo en una tabla el hotel no sabía qué habitación era de qué noche.
  const nochesPorHotel = new Map<string, Set<string>>();
  for (const r of datos.rows as any[]) {
    const set = nochesPorHotel.get(r.provider_id) ?? new Set<string>();
    set.add(r.reservation_id);
    nochesPorHotel.set(r.provider_id, set);
  }
  const conVariasNoches = Array.from(nochesPorHotel.entries()).find((e) => e[1].size > 1);

  if (conVariasNoches) {
    const filasHotel = filasDe(datos, { hotelId: conVariasNoches[0] });
    const nombreHotel = filasHotel[0].provider_name;
    const noches = Array.from(porNoche(filasHotel).values());
    console.log(`\n— ${nombreHotel}: ${noches.length} noches —`);

    const libro2 = await libroDeHotel(datos, filasHotel);
    const wb3 = new ExcelJS.Workbook();
    await wb3.xlsx.load(libro2!.buffer as any);
    const hoja = wb3.worksheets[0];

    // Una cabecera "HABITACIÓN" por noche: si sale una sola, están todas en la misma tabla.
    const cabeceras: number[] = [];
    const rotulos: string[] = [];
    hoja.eachRow((row, n) => {
      const v = String(row.getCell(1).value ?? "").toUpperCase();
      if (v === "HABITACIÓN") cabeceras.push(n);
      if (v.startsWith("NOCHE DEL")) rotulos.push(String(row.getCell(1).value));
    });
    check(cabeceras.length === noches.length, `${cabeceras.length} tabla(s) para ${noches.length} noche(s)`);
    check(rotulos.length === noches.length, `cada noche con su rótulo: ${rotulos.join(" | ")}`);

    // La tabla de una noche termina donde empieza la primera fila combinada A:C, que es
    // el siguiente rótulo o bloque ("No se hospedan", "Alimentación", la noche siguiente).
    const anchas = new Set<number>(
      ((hoja as any).model?.merges ?? [])
        .map((m: string) => /^A(\d+):C\d+$/.exec(m))
        .filter(Boolean)
        .map((m: RegExpExecArray) => Number(m[1]))
    );
    // Una habitación combinada sobre sus huéspedes repite su valor en cada fila del merge:
    // solo la primera fila cuenta como habitación nueva.
    const continuacion = new Set<number>();
    for (const m of ((hoja as any).model?.merges ?? []) as string[]) {
      const g = /^A(\d+):A(\d+)$/.exec(m);
      if (!g) continue;
      for (let n = Number(g[1]) + 1; n <= Number(g[2]); n++) continuacion.add(n);
    }

    const finDeTabla = (desde: number) => {
      for (let n = desde + 1; n <= hoja.rowCount; n++) if (anchas.has(n)) return n;
      return hoja.rowCount + 1;
    };

    for (const [i, noche] of Array.from(noches.entries())) {
      const desde = cabeceras[i];
      const hasta = finDeTabla(desde);

      const vistos: string[] = [];
      const enHoja = new Set<string>();
      for (let n = desde + 1; n < hasta; n++) {
        const hab = String(hoja.getCell(n, 1).value ?? "").trim();
        if (hab && !continuacion.has(n)) vistos.push(hab);
        const quien = String(hoja.getCell(n, 2).value ?? "").trim();
        if (quien && quien !== "— libre —") enHoja.add(quien);
      }

      const repetidos = vistos.filter((v, j) => vistos.indexOf(v) !== j);
      check(repetidos.length === 0, `noche ${i + 1}: ${vistos.length} habitaciones, sin nombres repetidos${repetidos.length ? ` (repite ${repetidos.join(", ")})` : ""}`);

      // La gente de cada tabla es la de esa reserva, no la de las dos noches juntas.
      const gente = new Set(noche.filter((r: any) => r.pilgrim_id).map((r: any) => String(r.pilgrim_name)));
      const sobran = Array.from(enHoja).filter((x) => !gente.has(x));
      const faltan = Array.from(gente).filter((x) => !enHoja.has(x as string));
      check(sobran.length === 0, `noche ${i + 1}: ${enHoja.size} huéspedes, ninguno de otra noche${sobran.length ? ` (sobra ${sobran.join(", ")})` : ""}`);
      check(faltan.length === 0, `noche ${i + 1}: están todos los de esa noche${faltan.length ? ` (falta ${faltan.join(", ")})` : ""}`);
    }
  } else {
    console.log("\n  (ningún hotel de este camino tiene más de una noche)");
  }

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
