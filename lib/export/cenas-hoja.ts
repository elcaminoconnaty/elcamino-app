import "server-only";
import { ExcelJS, TINTA, dato, encabezados, hoja, parrafo, seccion, subtitulo, titulo } from "@/lib/export/bonito";
import { conteoPorSeccion, dietasDe, progresoDe, type Cena } from "@/lib/export/cenas";
import { formatDate } from "@/lib/utils";

/**
 * La plantilla que se le manda al restaurante: lo mismo que va en el cuerpo del correo,
 * pero en Excel. Cuántos de cada plato, por sección y con su total — que es lo único que
 * la cocina necesita para trabajar.
 *
 * La lista nominal (quién eligió qué) no va acá: es de uso interno y vive en su propia
 * hoja, porque tiene tantas columnas como secciones tenga el menú y descuadraría esta.
 */

const COLUMNAS = ["Plato", "Cantidad"];
const ANCHOS = [52, 14];

export function hojaDeRestaurante(wb: ExcelJS.Workbook, grupo: Cena[], caminoNombre: string, nombreHoja?: string) {
  const r0 = grupo[0].info;
  const restaurante = r0.provider_name ?? "Restaurante";
  const ws = hoja(wb, nombreHoja ?? restaurante, ANCHOS);
  const cols = COLUMNAS.length;
  let f = 1;

  titulo(ws, f++, cols, restaurante);
  const ubicacion = [r0.provider_address, r0.location ?? r0.provider_city].filter(Boolean).join(" · ");
  if (ubicacion) subtitulo(ws, f++, cols, ubicacion);
  subtitulo(ws, f++, cols, caminoNombre, true);

  // Un mismo restaurante puede dar de cenar dos noches del camino: cada una con su bloque.
  for (const cena of grupo) {
    const d = cena.info;
    const { cenan, eligieron } = progresoDe(cena);
    f++;

    const fecha = d.check_in ? formatDate(d.check_in) : "sin fecha";
    seccion(ws, f++, cols, `Cena del ${fecha}${d.confirmation_ref ? ` · Ref. ${d.confirmation_ref}` : ""}`, {
      fondo: TINTA.atlantico,
      color: TINTA.alba,
      centrado: true,
    });
    const pendientes = Math.max(cenan - eligieron, 0);
    subtitulo(ws, f++, cols, `${cenan} comensales${pendientes > 0 ? ` · faltan ${pendientes} por elegir` : ""}`);

    if (cena.courses.length === 0) {
      parrafo(ws, f++, cols, "Este restaurante todavía no tiene el menú cargado: no hay elecciones que mandar.");
      continue;
    }
    if (d.menu_notes_pilgrim) parrafo(ws, f++, cols, `Nota: ${d.menu_notes_pilgrim}`);

    const secciones = conteoPorSeccion(cena);
    if (secciones.length === 0) {
      parrafo(ws, f++, cols, "El menú es el mismo para todos; no hay platos que elegir.");
    }
    for (const s of secciones) {
      seccion(ws, f++, cols, s.seccion, { fondo: TINTA.musgo, color: TINTA.alba, centrado: true });
      encabezados(ws, f++, COLUMNAS);
      for (const p of s.platos) {
        dato(ws, f, 1, p.todos ? `${p.plato} · para todos` : p.plato);
        dato(ws, f, 2, p.n, { centrado: true });
        f++;
      }
      dato(ws, f, 1, "TOTAL", { fuerte: true, fondo: TINTA.alba });
      dato(ws, f, 2, s.total, { fuerte: true, centrado: true, fondo: TINTA.alba });
      f++;
    }

    const enSitio = cena.courses.filter((c) => c.mode === "en_sitio");
    if (enSitio.length > 0) {
      parrafo(ws, f++, cols, `Se elige en la mesa: ${enSitio.map((c) => c.label).join(" · ")}.`);
    }

    const noCenan = cena.noCenan
      .map((id) => cena.porPeregrino.get(id)?.[0]?.pilgrim_name ?? "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "es"));
    if (noCenan.length > 0) {
      f++;
      seccion(ws, f++, cols, "No cenan");
      parrafo(ws, f++, cols, noCenan.join(", "));
    }

    const dietas = dietasDe(cena);
    if (dietas.length > 0) {
      f++;
      seccion(ws, f++, cols, "Alimentación");
      for (const [nombre, nota] of dietas) {
        dato(ws, f, 1, nombre);
        dato(ws, f, 2, nota);
        f++;
      }
    }
  }

  f++;
  ws.mergeCells(f, 1, f, cols);
  const pie = ws.getCell(f, 1);
  pie.value = "El Camino con Naty · elcaminoconnaty.com";
  pie.font = { name: "Arial", size: 8, italic: true, color: { argb: TINTA.castano } };
  pie.alignment = { horizontal: "center" };

  return ws;
}

/**
 * La lista nominal: una fila por peregrino y sección. En largo y no en ancho, porque cada
 * cena tiene sus propias secciones y en columnas no habría dos cenas que cuadraran.
 */
export function filasNominales(cenas: Cena[]): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  for (const cena of cenas) {
    const d = cena.info;
    const cursoDe = new Map(cena.courses.map((c) => [c.id, c]));
    const gente = Array.from(cena.porPeregrino.entries())
      .map(([id, filas]) => [id, String(filas[0]?.pilgrim_name ?? ""), filas] as const)
      .sort((a, b) => a[1].localeCompare(b[1], "es"));

    for (const [id, nombre, filas] of gente) {
      const noCena = cena.noCenan.includes(id);
      const elegidas = filas.filter((x: any) => x.course_id);
      if (noCena || elegidas.length === 0) {
        out.push({
          "Fecha": d.check_in ?? "",
          "Restaurante": d.provider_name ?? "",
          "Peregrino": nombre,
          "Sección": "",
          "Plato": noCena ? "no cena" : cena.courses.length === 0 ? "sin menú cargado" : "pendiente",
          "Alimentación": filas[0]?.dietary_notes ?? "",
          "Notas": "",
        });
        continue;
      }
      for (const x of elegidas) {
        const curso = cursoDe.get(x.course_id);
        out.push({
          "Fecha": d.check_in ?? "",
          "Restaurante": d.provider_name ?? "",
          "Peregrino": nombre,
          "Sección": curso?.label ?? "",
          "Plato": curso?.mode === "fijo" ? `${curso.fixed ?? ""} (todos)` : x.option_name ?? (curso?.required ? "— sin elegir —" : ""),
          "Alimentación": filas[0]?.dietary_notes ?? "",
          "Notas": x.choice_notes ?? "",
        });
      }
    }
  }
  return out;
}
