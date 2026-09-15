import "server-only";
import { ExcelJS, TINTA, dato, encabezados, hoja, pie, seccion, subtitulo, titulo } from "@/lib/export/bonito";
import { byRoom, nombresDeHabitacion, porNoche, roomName, type FilaRooming } from "@/lib/export/rooming";
import { formatDate } from "@/lib/utils";

/**
 * La plantilla que se le manda al hotel: la misma tabla del correo, pero en Excel.
 *
 * Tres columnas —habitación, huésped, pasaporte— con la habitación combinada sobre sus
 * huéspedes, que es como los hoteles la leen y como Nico la mandaba a mano. Todo lo demás
 * (alimentación, quién no se hospeda, notas) va en bloques rotulados debajo, para que la
 * tabla de arriba se pueda imprimir y pegar en recepción sin recortar nada.
 *
 * **Una tabla por noche.** Un hotel puede alojar al grupo dos noches seguidas y la gente
 * cambia de una a otra: en Santiago hay una noche en la que duermen Iván y Ramiro y otra
 * en la que no. Con todo en una sola tabla el hotel veía "Doble 2" repetida y no tenía
 * forma de saber a qué noche correspondía cada una.
 */

const COLUMNAS = ["Habitación", "Huésped", "Pasaporte"];

/** "1 habitación" / "3 habitaciones": el documento lo lee una persona, no un contador. */
const plural = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

/** "Noche del 2 al 3 de octubre de 2026", o solo la entrada si no hay salida cargada. */
function rotuloDeNoche(r: FilaRooming) {
  const entrada = r.check_in ? formatDate(r.check_in) : null;
  const salida = r.check_out && r.check_out !== r.check_in ? formatDate(r.check_out) : null;
  if (!entrada) return "Noche sin fecha cargada";
  return salida ? `Noche del ${entrada} al ${salida}` : `Noche del ${entrada}`;
}

export function hojaDeHotel(
  wb: ExcelJS.Workbook,
  filas: FilaRooming[],
  caminoNombre: string,
  noSeHospedan: Map<string, string[]>,
  nombreHoja?: string
) {
  const r0 = filas[0];
  const hotel = r0.provider_name ?? "Hotel";
  const ws = hoja(wb, nombreHoja ?? hotel, [22, 40, 20]);
  const cols = COLUMNAS.length;
  const nombres = nombresDeHabitacion(filas);
  const noches = Array.from(porNoche(filas).values());
  const variasNoches = noches.length > 1;
  let f = 1;

  // ── Encabezado ───────────────────────────────────────────────────────────
  titulo(ws, f++, cols, hotel);

  const ubicacion = [r0.provider_address, r0.location ?? r0.provider_city].filter(Boolean).join(" · ");
  if (ubicacion) subtitulo(ws, f++, cols, ubicacion);

  subtitulo(ws, f++, cols, caminoNombre, true);

  // Fechas y referencia en su propia línea: juntas con el camino no caben en el ancho.
  const refs = Array.from(new Set(filas.map((r) => r.confirmation_ref).filter(Boolean)));
  const primera = noches[0][0];
  const ultima = noches[noches.length - 1][0];
  const fechas = variasNoches
    ? `${plural(noches.length, "noche", "noches")} · del ${formatDate(primera.check_in)} al ${formatDate(ultima.check_out ?? ultima.check_in)}`
    : primera.check_in
      ? ultima.check_out && ultima.check_out !== primera.check_in
        ? `Entrada ${formatDate(primera.check_in)} · Salida ${formatDate(ultima.check_out)}`
        : `Entrada ${formatDate(primera.check_in)}`
      : null;
  const linea2 = [fechas, refs.length ? `Ref. ${refs.join(", ")}` : null].filter(Boolean).join(" · ");
  if (linea2) subtitulo(ws, f++, cols, linea2);

  // El panorama del hotel: con varias noches, la suma de todas.
  const personasTotal = new Set(filas.filter((r) => r.pilgrim_id).map((r) => r.pilgrim_id)).size;
  const comidas = [
    filas.some((r) => r.includes_breakfast) ? "desayuno incluido" : null,
    filas.some((r) => r.includes_dinner) ? "cena incluida" : null,
  ].filter(Boolean);
  if (variasNoches) {
    subtitulo(ws, f++, cols, `${plural(personasTotal, "persona", "personas")} en total${comidas.length ? ` · ${comidas.join(" · ")}` : ""}`);
  }

  let primeraCabecera = 0;

  // ── Una tabla por noche ──────────────────────────────────────────────────
  for (const noche of noches) {
    const n0 = noche[0];
    const habitaciones = byRoom(noche);
    const personas = new Set(noche.filter((r) => r.pilgrim_id).map((r) => r.pilgrim_id)).size;
    const plazas = Array.from(habitaciones.values()).reduce((s, g) => s + (Number(g[0].capacity_per_room) || 0), 0);

    f++; // aire

    // Con una sola noche las fechas ya están en el encabezado y el rótulo sobra.
    if (variasNoches) {
      seccion(ws, f++, cols, `${rotuloDeNoche(n0)}${n0.confirmation_ref ? ` · Ref. ${n0.confirmation_ref}` : ""}`, {
        fondo: TINTA.atlantico,
        color: TINTA.alba,
        centrado: true,
      });
    }

    const comidasNoche = [
      noche.some((r) => r.includes_breakfast) ? "desayuno incluido" : null,
      noche.some((r) => r.includes_dinner) ? "cena incluida" : null,
    ].filter(Boolean);
    subtitulo(
      ws,
      f++,
      cols,
      `${plural(habitaciones.size, "habitación", "habitaciones")} · ${plural(plazas, "plaza", "plazas")} · ${plural(personas, "persona", "personas")}${comidasNoche.length ? ` · ${comidasNoche.join(" · ")}` : ""}`
    );

    if (primeraCabecera === 0) primeraCabecera = f;
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
      dato(ws, desde, 1, roomName(h, nombres).toUpperCase(), { fuerte: true, centrado: true, color: TINTA.ocreProfundo, fondo: TINTA.alba });
      ws.getCell(desde, 1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }

    // ── Lo que el hotel necesita saber de *esta* noche ─────────────────────
    const excluidos = Array.from(new Set(noSeHospedan.get(n0.reservation_id) ?? []));
    if (excluidos.length > 0) {
      f++;
      seccion(ws, f++, cols, "No se hospedan esta noche");
      ws.mergeCells(f, 1, f, cols);
      dato(ws, f++, 1, excluidos.join(", "));
    }

    const dietas = noche.filter((r) => r.pilgrim_id && r.dietary_notes);
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
        dato(ws, f, 1, roomName(h, nombres).toUpperCase());
        ws.mergeCells(f, 2, f, cols);
        dato(ws, f++, 2, h.room_notes);
      }
    }
  }

  // Con varias noches cada bloque ya trae su cabecera; repetir la primera confundiría.
  if (!variasNoches && primeraCabecera > 0) ws.pageSetup.printTitlesRow = `${primeraCabecera}:${primeraCabecera}`;

  f++;
  pie(ws, f, cols);

  return ws;
}
