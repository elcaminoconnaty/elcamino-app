import "server-only";
import { ExcelJS, TINTA, dato, encabezados, hoja, seccion, subtitulo, titulo } from "@/lib/export/bonito";
import { byRoom, roomName, type FilaRooming } from "@/lib/export/rooming";
import { formatDate } from "@/lib/utils";

/**
 * La plantilla que se le manda al hotel: la misma tabla del correo, pero en Excel.
 *
 * Tres columnas —habitación, huésped, pasaporte— con la habitación combinada sobre sus
 * huéspedes, que es como los hoteles la leen y como Nico la mandaba a mano. Todo lo demás
 * (alimentación, quién no se hospeda, notas) va en bloques rotulados debajo, para que la
 * tabla de arriba se pueda imprimir y pegar en recepción sin recortar nada.
 */

const COLUMNAS = ["Habitación", "Huésped", "Pasaporte"];

export function hojaDeHotel(wb: ExcelJS.Workbook, filas: FilaRooming[], caminoNombre: string, noSeHospedan: Map<string, string[]>, nombreHoja?: string) {
  const r0 = filas[0];
  const hotel = r0.provider_name ?? "Hotel";
  const ws = hoja(wb, nombreHoja ?? hotel, [22, 40, 20]);
  const cols = COLUMNAS.length;
  let f = 1;

  // ── Encabezado ───────────────────────────────────────────────────────────
  titulo(ws, f++, cols, hotel);

  const ubicacion = [r0.provider_address, r0.location ?? r0.provider_city].filter(Boolean).join(" · ");
  if (ubicacion) subtitulo(ws, f++, cols, ubicacion);

  subtitulo(ws, f++, cols, caminoNombre, true);

  // Fechas y referencia en su propia línea: juntas con el camino no caben en el ancho.
  const entrada = r0.check_in ? formatDate(r0.check_in) : null;
  const salida = r0.check_out && r0.check_out !== r0.check_in ? formatDate(r0.check_out) : null;
  const fechas = entrada ? (salida ? `Entrada ${entrada} · Salida ${salida}` : `Entrada ${entrada}`) : null;
  const refs = Array.from(new Set(filas.map((r) => r.confirmation_ref).filter(Boolean)));
  const linea2 = [fechas, refs.length ? `Ref. ${refs.join(", ")}` : null].filter(Boolean).join(" · ");
  if (linea2) subtitulo(ws, f++, cols, linea2);

  const habitaciones = byRoom(filas);
  const personas = new Set(filas.filter((r) => r.pilgrim_id).map((r) => r.pilgrim_id)).size;
  const plazas = Array.from(habitaciones.values()).reduce((s, g) => s + (Number(g[0].capacity_per_room) || 0), 0);
  const comidas = [
    filas.some((r) => r.includes_breakfast) ? "desayuno incluido" : null,
    filas.some((r) => r.includes_dinner) ? "cena incluida" : null,
  ].filter(Boolean);
  subtitulo(ws, f++, cols, `${habitaciones.size} habitaciones · ${plazas} plazas · ${personas} personas${comidas.length ? ` · ${comidas.join(" · ")}` : ""}`);

  f++; // aire

  // ── La tabla ─────────────────────────────────────────────────────────────
  const primeraFila = f;
  encabezados(ws, f++, COLUMNAS);

  for (const grupo of Array.from(habitaciones.values())) {
    const h = grupo[0];
    const gente = grupo.filter((x) => x.pilgrim_id);
    // Una habitación sin nadie asignado igual se lista: el hotel la tiene reservada.
    const ocupantes = gente.length > 0 ? gente : [null];
    const desde = f;
    ocupantes.forEach((g: any) => {
      dato(ws, f, 2, g ? g.pilgrim_name : "— libre —", { color: g ? undefined : TINTA.castano });
      dato(ws, f, 3, g?.passport_number ?? "");
      f++;
    });
    // La habitación se combina sobre sus huéspedes, como en el correo.
    if (ocupantes.length > 1) ws.mergeCells(desde, 1, f - 1, 1);
    dato(ws, desde, 1, roomName(h).toUpperCase(), { fuerte: true, centrado: true, color: TINTA.ocreProfundo, fondo: TINTA.alba });
    ws.getCell(desde, 1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }

  // La fila de encabezados se repite si la tabla se va a dos páginas.
  ws.pageSetup.printTitlesRow = `${primeraFila}:${primeraFila}`;

  // ── Lo que el hotel necesita saber además ────────────────────────────────
  const reservas = Array.from(new Set(filas.map((r) => r.reservation_id)));
  const excluidos = reservas.flatMap((id) => noSeHospedan.get(id) ?? []);
  if (excluidos.length > 0) {
    f++;
    seccion(ws, f++, cols, "No se hospedan esta noche");
    ws.mergeCells(f, 1, f, cols);
    dato(ws, f++, 1, Array.from(new Set(excluidos)).join(", "));
  }

  const dietas = filas.filter((r) => r.pilgrim_id && r.dietary_notes);
  if (dietas.length > 0) {
    f++;
    seccion(ws, f++, cols, "Alimentación");
    for (const d of dietas) {
      dato(ws, f, 1, d.pilgrim_name);
      ws.mergeCells(f, 2, f, cols);
      dato(ws, f++, 2, d.dietary_notes);
    }
  }

  const notas = Array.from(habitaciones.values())
    .map((g) => g[0])
    .filter((h) => h.room_notes);
  if (notas.length > 0) {
    f++;
    seccion(ws, f++, cols, "Notas de habitación");
    for (const h of notas) {
      dato(ws, f, 1, roomName(h).toUpperCase());
      ws.mergeCells(f, 2, f, cols);
      dato(ws, f++, 2, h.room_notes);
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
