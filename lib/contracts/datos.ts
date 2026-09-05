import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DatosContrato } from "./minuta";

/**
 * De la base de datos a los trece campos del contrato.
 *
 * La regla de esta capa: **nunca rellenar a ojo**. Si falta un dato, se devuelve como
 * pendiente y la pantalla lo dice en claro. En Camino Sacro el generador se inventaba la
 * duración del viaje cuando a la ruta le faltaban etapas, y salió una oferta prometiendo
 * quince días sobre trece cotizados.
 */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2027-04-23" → "23 de abril de 2027", como lo escribe el contrato. */
export function fechaEnLetra(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} de ${MESES[m - 1]} de ${a}`;
}

/** "2027-04-23" → "23/04/27", como aparece en la cláusula del objeto. */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

/** El día anterior, en ISO. El seguro cubre hasta la víspera del regreso. */
export function diaAnterior(iso: string): string {
  const f = new Date(`${iso}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() - 1);
  return f.toISOString().slice(0, 10);
}

/** 2529 → "2.529,00 euros". */
export function euroEnLetra(n: number): string {
  return `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} euros`;
}

/**
 * El plan de cuotas en prosa, para la cláusula 4.
 * Naty lo escribe así: "1ER PAGO DEL 30%, SEGUNDO PAGO (NOVIEMBRE 2026) POR EL 30% Y
 * TERCER PAGO EN MARZO 2027 POR EL 40%". Si las cuotas están cargadas se arma solo; si no,
 * queda vacío y la pantalla pide el texto a mano.
 */
export function formaDePagoEnProsa(
  cuotas: Array<{ position: number; label: string | null; due_date: string; amount_eur: number }>,
  totalEur: number
): string {
  if (!cuotas.length || totalEur <= 0) return "";
  const ORDINAL = ["PRIMER", "SEGUNDO", "TERCER", "CUARTO", "QUINTO", "SEXTO"];
  const partes = cuotas
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((c, i) => {
      const pct = Math.round((Number(c.amount_eur) / totalEur) * 100);
      const [anio, mes] = c.due_date.split("-");
      const cuando = `${MESES[Number(mes) - 1].toUpperCase()} ${anio}`;
      const ordinal = ORDINAL[i] ?? `${i + 1}º`;
      // El primero es el de la reserva y no lleva fecha, como en los contratos firmados.
      return i === 0
        ? `${ordinal} PAGO DEL ${pct}%`
        : `${ordinal} PAGO (${cuando}) POR EL ${pct}%`;
    });
  return partes.length === 1
    ? partes[0]
    : `${partes.slice(0, -1).join(", ")} Y ${partes[partes.length - 1]}`;
}

export type Pendiente = { campo: string; que_falta: string; donde: string };

/** Lo que ve Naty antes de generar: qué diría el contrato y qué falta para poder emitirlo. */
export type RevisionContrato = {
  datos: Partial<DatosContrato>;
  pendientes: Pendiente[];
  avisos: string[];
  listo: boolean;
};

export type ArmadoContrato = {
  datos: Partial<DatosContrato>;
  pendientes: Pendiente[];
  /** Avisos que no impiden emitir, pero que Naty tiene que ver. */
  avisos: string[];
};

/**
 * Reúne todo lo necesario para el contrato de una inscripción y dice qué falta.
 * No escribe nada: solo lee y arma.
 */
export async function armarDatosContrato(
  registrationId: string,
  opciones?: { anexo1Url?: string; formaDePagoManual?: string; fechaFirma?: string }
): Promise<ArmadoContrato> {
  const supabase = createClient();
  const pendientes: Pendiente[] = [];
  const avisos: string[] = [];

  const { data: reg, error } = await supabase
    .from("registrations")
    .select(
      `id, total_eur, discount_eur,
       pilgrims:pilgrim_id ( full_name, sex, email, address, document_id, document_kind, passport_number, passport_expiry_date ),
       departures:departure_id ( name, start_date, end_date, contract_start_date, contract_end_date, origin_city, destination_city, contract_plan_name, brochure_url )`
    )
    .eq("id", registrationId)
    .single();

  if (error || !reg) throw new Error(error?.message ?? "No encontré la inscripción.");

  const p = reg.pilgrims as any;
  const d = reg.departures as any;

  // --- Peregrino ---
  if (!p?.full_name) pendientes.push({ campo: "viajero_nombre", que_falta: "el nombre completo", donde: "la tarjeta del peregrino" });
  if (!p?.email) pendientes.push({ campo: "viajero_email", que_falta: "el correo electrónico", donde: "la tarjeta del peregrino" });
  if (!p?.address) pendientes.push({ campo: "viajero_direccion", que_falta: "la dirección de notificaciones", donde: "la tarjeta del peregrino" });
  if (!p?.sex) pendientes.push({ campo: "viajero_identificado", que_falta: "el sexo (para escribir «identificado» o «identificada»)", donde: "los datos del pasaporte" });

  // El contrato usa el pasaporte cuando lo hay; si no, la cédula.
  const usaPasaporte = p?.document_kind ? p.document_kind === "pasaporte" : Boolean(p?.passport_number);
  const numeroDoc = usaPasaporte ? p?.passport_number : p?.document_id;
  if (!numeroDoc) {
    pendientes.push({
      campo: "viajero_documento_frase",
      que_falta: usaPasaporte ? "el número de pasaporte" : "el número de cédula",
      donde: "los datos del pasaporte",
    });
  }

  // --- Camino ---
  // Las fechas del contrato son suyas, no las de la operación: en los dos contratos
  // firmados difieren de `start_date`/`end_date` por uno o varios días.
  const inicio = d?.contract_start_date ?? d?.start_date ?? null;
  const fin = d?.contract_end_date ?? d?.end_date ?? null;
  if (!inicio || !fin) {
    pendientes.push({ campo: "plan_descripcion", que_falta: "las fechas del viaje para el contrato", donde: "la ficha del camino" });
  } else if (d?.contract_start_date == null || d?.contract_end_date == null) {
    avisos.push(
      `Este contrato va a usar las fechas de operación (${fechaCorta(inicio)} a ${fechaCorta(fin)}). ` +
        `Si las del contrato son otras, cargalas en la ficha del camino antes de enviar.`
    );
  }
  if (!d?.origin_city || !d?.destination_city) {
    pendientes.push({ campo: "plan_descripcion", que_falta: "la ciudad de origen y la de destino", donde: "la ficha del camino" });
  }
  if (!d?.contract_plan_name) {
    pendientes.push({ campo: "plan_descripcion", que_falta: "el nombre del plan tal como debe decirlo el contrato", donde: "la ficha del camino" });
  }

  // --- Plata ---
  const total = Number(reg.total_eur ?? 0) - Number(reg.discount_eur ?? 0);
  if (!(total > 0)) {
    pendientes.push({ campo: "valor_total", que_falta: "el precio acordado", donde: "la inscripción" });
  }

  let formaDePago = opciones?.formaDePagoManual?.trim() ?? "";
  if (!formaDePago) {
    const { data: cuotas } = await supabase
      .from("payment_plan_installments")
      .select("position, label, due_date, amount_eur")
      .eq("registration_id", registrationId)
      .order("position");
    formaDePago = formaDePagoEnProsa(cuotas ?? [], total);
    const suma = (cuotas ?? []).reduce((s, c) => s + Number(c.amount_eur), 0);
    if (cuotas?.length && Math.abs(suma - total) > 0.5) {
      avisos.push(
        `Las cuotas suman ${euroEnLetra(suma)} y el precio acordado es ${euroEnLetra(total)}. ` +
          `Revisá el acuerdo de pago antes de emitir.`
      );
    }
  }
  if (!formaDePago) {
    pendientes.push({ campo: "forma_de_pago", que_falta: "el acuerdo de pago", donde: "el plan de pagos de la inscripción" });
  }

  // El Anexo No. 1 sale de la ficha del camino; se puede pisar desde la pantalla si hace falta.
  const anexo1 = opciones?.anexo1Url ?? d?.brochure_url ?? undefined;
  if (!anexo1) {
    pendientes.push({
      campo: "anexo1_url",
      que_falta: "el enlace a las condiciones del viaje (Anexo No. 1 del contrato)",
      donde: "la ficha del camino",
    });
  }

  // --- Avisos que no bloquean ---
  if (p?.passport_expiry_date && inicio) {
    const vence = new Date(`${p.passport_expiry_date}T12:00:00Z`);
    const limite = new Date(`${inicio}T12:00:00Z`);
    limite.setUTCMonth(limite.getUTCMonth() + 6);
    if (vence < limite) {
      avisos.push(
        `El pasaporte vence el ${fechaEnLetra(p.passport_expiry_date)}, menos de seis meses después de la salida. ` +
          `Con eso puede no embarcar.`
      );
    }
  }

  const hoy = opciones?.fechaFirma ?? new Date().toISOString().slice(0, 10);

  const datos: Partial<DatosContrato> = {
    viajero_nombre: p?.full_name ? String(p.full_name).toUpperCase() : undefined,
    viajero_identificado: p?.sex ? (String(p.sex).toUpperCase().startsWith("F") ? "identificada" : "identificado") : undefined,
    viajero_documento_frase: numeroDoc
      ? usaPasaporte
        ? `el pasaporte ${numeroDoc}`
        : `la cédula de ciudadanía número ${numeroDoc}`
      : undefined,
    viajero_documento_label: numeroDoc ? `${usaPasaporte ? "P.A." : "C.C."} ${numeroDoc}` : undefined,
    viajero_direccion: p?.address ?? undefined,
    viajero_email: p?.email ?? undefined,
    plan_descripcion:
      inicio && fin && d?.origin_city && d?.destination_city && d?.contract_plan_name
        ? `${d.contract_plan_name} - ORIGEN: ${d.origin_city} - DESTINO: ${d.destination_city} - ${fechaCorta(inicio)} - ${fechaCorta(fin)}`
        : undefined,
    anexo1_url: anexo1,
    valor_total: total > 0 ? euroEnLetra(total) : undefined,
    forma_de_pago: formaDePago || undefined,
    // El seguro cubre desde la salida hasta la víspera del regreso.
    seguro_desde: inicio ? fechaEnLetra(inicio) : undefined,
    seguro_hasta: fin ? fechaEnLetra(diaAnterior(fin)) : undefined,
    fecha_firma: fechaEnLetra(hoy),
  };

  return { datos, pendientes, avisos };
}
