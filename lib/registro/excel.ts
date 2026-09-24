import "server-only";
import type { FilaRegistro, RegistroDelCamino } from "@/lib/registro/datos-equipo";
import { ExcelJS, TINTA, dato, encabezados, hoja, libroABuffer, pie, seccion, subtitulo, titulo } from "@/lib/export/bonito";
import { TALLAS_CAMISETA, TALLAS_SANDALIA } from "@/lib/registro/textos";

/**
 * Todo lo que llenaron los peregrinos del camino en el formulario de registro, en un Excel
 * con la marca: la tabla completa, el conteo de tallas para pedir el kit, las restricciones
 * de alimentación para los restaurantes y lo que falta o hay que revisar.
 */

const f = (iso: string | null) => {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

const SIN_RESTRICCION = /^(ning[uú]na?|no|n\/a|na|nada|-|no tengo( ninguna)?)\.?$/i;

function revisar(x: FilaRegistro): string {
  return x.avisos.filter((a) => a.nivel !== "ok").map((a) => a.texto).join(" ");
}

export async function construirExcelRegistro(r: RegistroDelCamino): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "El Camino con Naty";
  const llenos = r.filas.filter((x) => x.formularioLleno).length;
  const contexto = `${r.filas.length} peregrinos · ${llenos} llenaron el formulario · bajado el ${f(new Date().toISOString())}`;

  // ── Registro completo ──
  const cols: Array<[string, number, (x: FilaRegistro) => any]> = [
    ["Peregrino", 30, (x) => x.nombre],
    ["Apodo", 12, (x) => x.apodo],
    ["Formulario", 13, (x) => (x.formularioLleno ? f(x.formularioLleno) : "pendiente")],
    ["Celular", 18, (x) => x.celular],
    ["Correo", 28, (x) => x.correo],
    ["Nacimiento", 12, (x) => f(x.nacimiento)],
    ["Edad al caminar", 9, (x) => x.edad],
    ["Pasaporte", 14, (x) => x.pasaporte],
    ["Vence", 12, (x) => f(x.pasaporteVence)],
    ["Verificación pasaporte", 46, (x) => revisar(x) || x.avisos.find((a) => a.nivel === "ok")?.texto || ""],
    ["Dirección", 36, (x) => x.direccion],
    ["Instagram", 16, (x) => (x.instagram ? `@${x.instagram}` : "")],
    ["Emergencia: nombre", 24, (x) => x.emergenciaNombre],
    ["Parentesco", 12, (x) => x.emergenciaParentesco],
    ["Emergencia: celular", 18, (x) => x.emergenciaCelular],
    ["Camiseta", 9, (x) => x.camiseta],
    ["Sandalia", 9, (x) => x.sandalia],
    ["Alimentación", 40, (x) => x.alimentacion],
  ];
  const ws = hoja(wb, "Registro", cols.map((c) => c[1]), true);
  titulo(ws, 1, cols.length, `Registro de peregrinos · ${r.camino}`);
  subtitulo(ws, 2, cols.length, contexto);
  encabezados(ws, 4, cols.map((c) => c[0]));
  r.filas.forEach((x, i) => {
    const problema = x.avisos.some((a) => a.nivel === "error");
    cols.forEach(([nombre, , valor], j) => {
      const esVerif = nombre === "Verificación pasaporte";
      dato(ws, 5 + i, j + 1, valor(x), {
        fondo: i % 2 ? TINTA.alba : undefined,
        color: esVerif && problema ? TINTA.error : !x.formularioLleno && nombre === "Formulario" ? TINTA.ocreProfundo : undefined,
        fuerte: j === 0,
      });
    });
  });
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 4, xSplit: 1 }];
  pie(ws, 6 + r.filas.length, cols.length);

  // ── Tallas: lo que hay que pedir para el kit ──
  const wt = hoja(wb, "Tallas", [22, 12, 50]);
  titulo(wt, 1, 3, `Tallas del kit · ${r.camino}`);
  subtitulo(wt, 2, 3, contexto);
  let fila = 4;
  for (const [nombre, tallas, de] of [
    ["Camisetas", TALLAS_CAMISETA as readonly (string | number)[], (x: FilaRegistro) => x.camiseta],
    ["Sandalias", TALLAS_SANDALIA as readonly (string | number)[], (x: FilaRegistro) => x.sandalia],
  ] as const) {
    seccion(wt, fila++, 3, nombre);
    encabezados(wt, fila++, ["Talla", "Cantidad", "Quiénes"]);
    for (const t of tallas) {
      const quienes = r.filas.filter((x) => String(de(x) ?? "") === String(t));
      if (!quienes.length) continue;
      dato(wt, fila, 1, t, { fuerte: true, centrado: true });
      dato(wt, fila, 2, quienes.length, { centrado: true });
      dato(wt, fila, 3, quienes.map((q) => q.nombre).join(", "));
      fila++;
    }
    const sin = r.filas.filter((x) => !de(x));
    dato(wt, fila, 1, "Total", { fuerte: true, fondo: TINTA.piedra });
    dato(wt, fila, 2, r.filas.length - sin.length, { fuerte: true, centrado: true, fondo: TINTA.piedra });
    dato(wt, fila, 3, sin.length ? `Faltan ${sin.length}: ${sin.map((q) => q.nombre).join(", ")}` : "Completo", { fondo: TINTA.piedra, color: sin.length ? TINTA.ocreProfundo : undefined });
    fila += 2;
  }
  pie(wt, fila, 3);

  // ── Alimentación: para los restaurantes ──
  const conRestriccion = r.filas.filter((x) => x.alimentacion && !SIN_RESTRICCION.test(x.alimentacion.trim()));
  const wa = hoja(wb, "Alimentación", [30, 70]);
  titulo(wa, 1, 2, `Restricciones de alimentos · ${r.camino}`);
  subtitulo(wa, 2, 2, `${conRestriccion.length} con alguna restricción · ${r.filas.filter((x) => !x.alimentacion).length} sin responder`);
  encabezados(wa, 4, ["Peregrino", "Restricción"]);
  conRestriccion.forEach((x, i) => {
    dato(wa, 5 + i, 1, x.nombre, { fuerte: true, fondo: i % 2 ? TINTA.alba : undefined });
    dato(wa, 5 + i, 2, x.alimentacion, { fondo: i % 2 ? TINTA.alba : undefined });
  });
  if (!conRestriccion.length) dato(wa, 5, 1, "Nadie reportó restricciones.");
  pie(wa, 6 + Math.max(conRestriccion.length, 1), 2);

  // ── Por revisar: la lista de tareas antes de viajar ──
  const pendientes = r.filas
    .map((x) => {
      const cosas: string[] = [];
      if (!x.formularioLleno) cosas.push(x.formularioEnviado ? `Se le mandó el formulario el ${f(x.formularioEnviado)} y no lo ha llenado.` : "No se le ha mandado el formulario.");
      if (!x.bienvenidaEnviada) cosas.push("No se le ha mandado la carta de bienvenida.");
      const pas = revisar(x);
      if (pas) cosas.push(pas);
      return { x, cosas };
    })
    .filter((p) => p.cosas.length);
  const wp = hoja(wb, "Por revisar", [30, 90]);
  titulo(wp, 1, 2, `Por revisar · ${r.camino}`);
  subtitulo(wp, 2, 2, pendientes.length ? `${pendientes.length} peregrinos con algo pendiente` : "Nada pendiente");
  encabezados(wp, 4, ["Peregrino", "Qué falta o hay que mirar"]);
  pendientes.forEach((p, i) => {
    dato(wp, 5 + i, 1, p.x.nombre, { fuerte: true });
    dato(wp, 5 + i, 2, p.cosas.join("\n"), { color: p.x.avisos.some((a) => a.nivel === "error") ? TINTA.error : undefined });
  });
  pie(wp, 6 + pendientes.length, 2);

  return libroABuffer(wb);
}
