import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tituloDeNombre } from "@/lib/passport/nombres";
import { fechaDeDia, tieneDiaCero } from "@/lib/rutas-fechas";

/**
 * De la base a la carta de bienvenida.
 *
 * La carta es la misma para todo el camino; solo cambian las fechas (que salen de la
 * salida y de las etapas de la ruta) y el nombre de quien la recibe. Así, cuando se abre un
 * camino nuevo la carta ya existe: no hay que rehacer un PDF a mano.
 *
 * Lo único que no está en la ruta es el lugar exacto del encuentro ("Estación Chamartín"),
 * que vive en `departures.welcome_letter`. Si falta, la carta dice la ciudad.
 *
 * Como el contrato y el documento de viaje, no se inventa nada: lo que falta se devuelve
 * en `pendientes` y la tarjeta del peregrino lo avisa.
 */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2027-04-23" → "23 de abril de 2027". */
export const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
};
/** "2027-04-23" → "23 de abril". */
export const fechaDiaMes = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]}`;
};
/** "2027-04-23" → "23 ABR". */
export const fechaChip = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES_CORTOS[m - 1].toUpperCase()}`;
};

function sumarDias(iso: string, n: number): string {
  const f = new Date(`${iso}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + n);
  return f.toISOString().slice(0, 10);
}

/** "Santiago" a secas no le dice nada a quien no conoce el Camino. */
function lugarCompleto(l: string | null | undefined): string {
  const v = (l ?? "").trim();
  return /^santiago$/i.test(v) ? "Santiago de Compostela" : v;
}

const ES_MAR = /finisterre|fisterra|mux[ií]a/i;

export type Destinatario = {
  nombre: string;
  /** "Querida Laura", "Querido Juan"; sin sexo conocido, "Hola, Laura". */
  saludo: string;
  /** "Bienvenida, Laura". */
  bienvenida: string;
};

export type DiaCarta = { fecha: string; chip: string; etapa: string | null; texto: string; km: number | null };

export type CartaBienvenida = {
  camino: string;
  /** "Camino Francés". */
  ruta: string;
  /** "Abril 2027". */
  edicion: string;
  destinatario: Destinatario | null;
  /** `lugar` es el punto exacto ("Estación Chamartín, Madrid"); `ciudad`, dónde hay que llegar. */
  encuentro: { fecha: string; lugar: string; ciudad: string; hora: string; trasladoA: string | null } | null;
  /** El día anterior al encuentro: el que la carta sugiere para llegar. */
  llegadaSugerida: string | null;
  cierre: { fecha: string; lugar: string } | null;
  dias: number | null;
  etapas: number;
  km: number | null;
  itinerario: DiaCarta[];
  /** El ritual de cierre en el mar, si la ruta lo tiene (Finisterre, Muxía). */
  ritual: { fecha: string; lugar: string } | null;
  pendientes: string[];
};

/** "Camino Francés (Sarria → Santiago)" → "Camino Francés". */
function nombreDeRuta(r: string | null | undefined): string {
  return String(r ?? "").replace(/\s*\(.*\)\s*$/, "").trim();
}

export function destinatarioDe(p: { full_name: string; nickname?: string | null; sex?: string | null }): Destinatario {
  const nombre = tituloDeNombre((p.nickname ?? "").trim() || String(p.full_name).trim().split(/\s+/)[0]);
  if (p.sex === "F") return { nombre, saludo: `Querida ${nombre}`, bienvenida: `Bienvenida, ${nombre}` };
  if (p.sex === "M") return { nombre, saludo: `Querido ${nombre}`, bienvenida: `Bienvenido, ${nombre}` };
  return { nombre, saludo: `Hola, ${nombre}`, bienvenida: `Bienvenid@, ${nombre}` };
}

export async function armarCarta(
  departureId: string,
  opciones?: { registrationId?: string | null; publico?: boolean }
): Promise<CartaBienvenida> {
  const db = opciones?.publico ? createAdminClient() : createClient();
  const pendientes: string[] = [];

  const { data: dep, error } = await db
    .from("departures")
    .select("id, name, start_date, end_date, route_id, welcome_letter, routes:route_id ( name, km )")
    .eq("id", departureId)
    .single();
  if (error || !dep) throw new Error(error?.message ?? "No encontré ese camino.");
  const ajustes = ((dep as any).welcome_letter ?? {}) as { encuentro_lugar?: string | null; encuentro_hora?: string | null };

  let destinatario: Destinatario | null = null;
  if (opciones?.registrationId) {
    const { data: reg } = await db
      .from("registrations")
      .select("id, departure_id, pilgrims:pilgrim_id ( full_name, nickname, sex )")
      .eq("id", opciones.registrationId)
      .eq("departure_id", departureId)
      .maybeSingle();
    const p = (reg as any)?.pilgrims;
    if (!p) throw new Error("No encontré esa inscripción en este camino.");
    destinatario = destinatarioDe(p);
  }

  const { data: etapas } = (dep as any).route_id
    ? await db.from("route_stages").select("day_offset, day_kind, from_place, to_place, km").eq("route_id", (dep as any).route_id).order("day_offset")
    : { data: [] as any[] };
  const lista = (etapas ?? []) as Array<{ day_offset: number; day_kind: string; from_place: string | null; to_place: string | null; km: number | null }>;

  const inicio = (dep as any).start_date as string | null;
  if (!inicio) pendientes.push("El camino no tiene fecha de inicio.");
  if (!(dep as any).end_date) pendientes.push("El camino no tiene fecha de fin: revisa que las fechas estén bien.");
  if (!lista.length) pendientes.push("La ruta del camino no tiene etapas cargadas.");

  // Mismo cálculo que el documento de viaje: ver lib/rutas-fechas.ts.
  const hayCero = tieneDiaCero(lista);
  const fechaDe = (i: number) => (inicio && lista[i] ? fechaDeDia(inicio, lista[i].day_offset, hayCero) : null);

  const iLlegada = lista.findIndex((e) => e.day_kind === "llegada");
  const iSalida = (() => {
    for (let i = lista.length - 1; i >= 0; i--) if (lista[i].day_kind === "salida") return i;
    return -1;
  })();
  if (iLlegada < 0) pendientes.push("La ruta no marca el día del encuentro (tipo «llegada»).");
  if (iSalida < 0) pendientes.push("La ruta no marca el día de cierre (tipo «salida»).");

  const desde = iLlegada >= 0 ? iLlegada : Math.max(lista.findIndex((e) => e.day_kind === "camino"), 0);
  const hasta = iSalida >= 0 ? iSalida : lista.length - 1;
  const itinerario: DiaCarta[] = [];
  let ritual: CartaBienvenida["ritual"] = null;
  let nEtapa = 0;
  for (let i = desde; i <= hasta && i >= 0; i++) {
    const e = lista[i];
    const fecha = fechaDe(i);
    if (!fecha) continue;
    const de = lugarCompleto(e.from_place);
    const a = lugarCompleto(e.to_place);
    let texto = "";
    let etapa: string | null = null;
    switch (e.day_kind) {
      case "llegada":
        texto = `Encuentro grupal en ${de}${a && a !== de ? ` · traslado a ${a}` : ""}`;
        break;
      case "camino":
        nEtapa += 1;
        etapa = `Etapa ${nEtapa}`;
        // Raya y no flecha: la DM Sans del PDF no trae "→" y sale un apóstrofo.
        texto = `${de} – ${a}`;
        break;
      case "excursion":
        if (ES_MAR.test(a)) {
          texto = `Círculo de cierre · traslado a ${a} · ritual en el mar`;
          ritual = { fecha, lugar: a };
        } else texto = `Excursión a ${a || de}`;
        break;
      case "descanso":
        texto = `Día de descanso en ${a || de}`;
        break;
      case "salida":
        texto = "Desayuno de despedida · fin del acompañamiento";
        break;
      default:
        texto = [de, a].filter(Boolean).join(" – ");
    }
    itinerario.push({ fecha, chip: fechaChip(fecha), etapa, texto, km: e.day_kind === "camino" && e.km ? Number(e.km) : null });
  }

  const caminadas = lista.filter((e) => e.day_kind === "camino");
  const kmEtapas = caminadas.reduce((s, e) => s + Number(e.km ?? 0), 0);
  // El kilometraje oficial de la ruta manda (el Francés se anuncia de 115 km); la suma de
  // etapas es el respaldo cuando la ruta no lo tiene.
  const km = (dep as any).routes?.km ? Number((dep as any).routes.km) : kmEtapas > 0 ? Math.round(kmEtapas) : null;

  const fEncuentro = iLlegada >= 0 ? fechaDe(iLlegada) : null;
  const fCierre = iSalida >= 0 ? fechaDe(iSalida) : null;
  const lugarEncuentro = (ajustes.encuentro_lugar ?? "").trim() || lugarCompleto(lista[iLlegada]?.from_place);

  const edicion = inicio ? `${MESES[Number(inicio.slice(5, 7)) - 1].replace(/^./, (c) => c.toUpperCase())} ${inicio.slice(0, 4)}` : "";

  return {
    camino: (dep as any).name,
    ruta: nombreDeRuta((dep as any).routes?.name) || (dep as any).name,
    edicion,
    destinatario,
    encuentro: fEncuentro
      ? {
          fecha: fEncuentro,
          lugar: lugarEncuentro,
          ciudad: lugarCompleto(lista[iLlegada]?.from_place) || lugarEncuentro,
          hora: (ajustes.encuentro_hora ?? "").trim() || "hora exacta a confirmar 20 días antes",
          trasladoA:
            lista[iLlegada]?.to_place && lista[iLlegada].to_place !== lista[iLlegada].from_place ? lugarCompleto(lista[iLlegada].to_place) : null,
        }
      : null,
    llegadaSugerida: fEncuentro ? sumarDias(fEncuentro, -1) : null,
    cierre: fCierre ? { fecha: fCierre, lugar: lugarCompleto(lista[iSalida]?.from_place) } : null,
    dias: fEncuentro && fCierre ? Math.round((new Date(fCierre).getTime() - new Date(fEncuentro).getTime()) / 864e5) + 1 : null,
    etapas: caminadas.length,
    km,
    itinerario,
    ritual,
    pendientes,
  };
}

/** "Bienvenida-Camino-Frances-Abril-2027-Laura.pdf" */
export function nombreDeArchivo(c: CartaBienvenida): string {
  const partes = ["Bienvenida", c.ruta, c.edicion, c.destinatario?.nombre].filter(Boolean).join(" ");
  return `${partes.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}
