import "server-only";
import { RESERVATION_PAYMENT_METHODS } from "@/lib/constants";

/**
 * El informe de pagos pendientes a proveedores de un camino: es la Hoja1 que Naty llevaba
 * a mano ("Falta por pagar"), con lo que necesita para girar sin buscar nada más — a quién,
 * cuánto, cómo, desde dónde y a qué cuenta. Lo comparten el PDF y el Excel.
 */

export type FilaPago = {
  reservation_id: string;
  proveedor: string;
  servicio: string;
  fecha: string | null;
  estado: string;
  total_eur: number;
  pagado_eur: number;
  saldo_eur: number;
  /** transferencia | bizum | … (de la reserva, o el habitual del proveedor). */
  medio: string | null;
  medio_label: string;
  cuenta_origen: string | null;
  /** Lo que hay que copiar para pagar: banco, titular, IBAN… según el medio. */
  datos_pago: string[];
  proxima_cuota: { fecha: string; monto_eur: number; label: string | null; vencida: boolean } | null;
  /** Cuotas pendientes en orden. */
  cuotas: { fecha: string; monto_eur: number; label: string | null; vencida: boolean }[];
};

export type OtroPendiente = { descripcion: string; categoria: string; total_eur: number; pagado_eur: number; saldo_eur: number };

export type InformePagos = {
  camino: string;
  fechas: string;
  generado: string;
  trm: number | null;
  filas: FilaPago[];
  otros: OtroPendiente[];
  totales: { total_eur: number; pagado_eur: number; saldo_eur: number; saldo_cop: number | null; vencido_eur: number };
  /** Reservas con saldo pero sin datos de pago: hay que completarlos en el proveedor. */
  sinDatos: string[];
};

const LABEL_MEDIO = new Map<string, string>(RESERVATION_PAYMENT_METHODS.map((m) => [m.value, m.label]));

function datosDePago(medio: string | null, p: any): string[] {
  const out: string[] = [];
  if (medio === "transferencia" || (!medio && p?.iban)) {
    if (p?.bank_name) out.push(`Banco: ${p.bank_name}`);
    if (p?.account_holder) out.push(`Titular: ${p.account_holder}`);
    if (p?.iban) out.push(`IBAN: ${p.iban}`);
    if (p?.swift_bic) out.push(`SWIFT: ${p.swift_bic}`);
  } else if (medio === "bizum") {
    if (p?.bizum_phone) out.push(`Bizum: ${p.bizum_phone}`);
    if (p?.account_holder) out.push(`Titular: ${p.account_holder}`);
  } else if (medio === "booking") {
    out.push("Se paga por la plataforma (Booking)");
  } else if (medio === "tarjeta") {
    out.push("Con tarjeta");
  } else if (medio === "efectivo") {
    out.push("En efectivo, al llegar");
  }
  if (p?.payment_notes) out.push(p.payment_notes);
  return out;
}

export async function armarInformePagos(supabase: any, departureId: string): Promise<InformePagos | null> {
  const hoy = new Date().toISOString().slice(0, 10);
  const [{ data: dep }, { data: reservas }, { data: pagos }, { data: cuotas }, { data: otros }, { data: ultimaTrm }] = await Promise.all([
    supabase.from("departures").select("id, name, start_date, end_date, trm_frozen_value").eq("id", departureId).maybeSingle(),
    supabase
      .from("reservations")
      .select("id, type, location, check_in, check_out, status, meal_kind, confirmed_cost_eur, estimated_cost_eur, payment_method, pay_from_account, providers(id, name, payment_method_default, bank_name, account_holder, iban, swift_bic, bizum_phone, payment_notes)")
      .eq("departure_id", departureId)
      .neq("status", "cancelado")
      .order("check_in", { ascending: true, nullsFirst: false }),
    supabase.from("v_reservation_payments").select("reservation_id, paid_eur, saldo_eur, cost_eur").eq("departure_id", departureId),
    supabase.from("v_reservation_schedule").select("reservation_id, due_date, amount_eur, label, paid").eq("departure_id", departureId).eq("paid", false).order("due_date"),
    supabase.from("v_budget_payable").select("description, category, line_total_eur, paid_eur, saldo_eur").eq("departure_id", departureId).is("reservation_id", null),
    supabase.from("trm_rates").select("eur_cop").order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!dep) return null;

  const pagoDe = new Map<string, any>();
  for (const p of pagos ?? []) pagoDe.set(p.reservation_id, p);
  const cuotasDe = new Map<string, any[]>();
  for (const c of cuotas ?? []) cuotasDe.set(c.reservation_id, [...(cuotasDe.get(c.reservation_id) ?? []), c]);

  const filas: FilaPago[] = [];
  const sinDatos: string[] = [];
  for (const r of (reservas ?? []) as any[]) {
    const pago = pagoDe.get(r.id);
    const total = Number(pago?.cost_eur ?? r.confirmed_cost_eur ?? r.estimated_cost_eur ?? 0);
    const pagado = Number(pago?.paid_eur ?? 0);
    const saldo = pago ? Number(pago.saldo_eur ?? 0) : Math.max(total - pagado, 0);
    if (saldo <= 0.01) continue;
    const prov = r.providers ?? {};
    const medio = r.payment_method ?? prov.payment_method_default ?? null;
    const datos = datosDePago(medio, prov);
    if (datos.length === 0) sinDatos.push(prov.name ?? "—");
    const lista = (cuotasDe.get(r.id) ?? []).map((c: any) => ({
      fecha: String(c.due_date),
      monto_eur: Number(c.amount_eur ?? 0),
      label: c.label ?? null,
      vencida: String(c.due_date) < hoy,
    }));
    const servicio = [
      r.type === "cenas" ? (r.meal_kind ? r.meal_kind[0].toUpperCase() + r.meal_kind.slice(1) : "Comida") : r.type[0].toUpperCase() + r.type.slice(1),
      r.location ?? null,
    ]
      .filter(Boolean)
      .join(" · ");
    filas.push({
      reservation_id: r.id,
      proveedor: prov.name ?? "—",
      servicio,
      fecha: r.check_in ?? null,
      estado: r.status,
      total_eur: total,
      pagado_eur: pagado,
      saldo_eur: saldo,
      medio,
      medio_label: medio ? LABEL_MEDIO.get(medio) ?? medio : "—",
      cuenta_origen: r.pay_from_account ?? null,
      datos_pago: datos,
      proxima_cuota: lista[0] ?? null,
      cuotas: lista,
    });
  }

  const otrosPend: OtroPendiente[] = ((otros ?? []) as any[])
    .filter((b) => Number(b.saldo_eur ?? 0) > 0.01)
    .map((b) => ({ descripcion: b.description, categoria: b.category, total_eur: Number(b.line_total_eur ?? 0), pagado_eur: Number(b.paid_eur ?? 0), saldo_eur: Number(b.saldo_eur ?? 0) }));

  const trm = Number(dep.trm_frozen_value ?? ultimaTrm?.eur_cop ?? 0) || null;
  const total_eur = filas.reduce((s, f) => s + f.total_eur, 0);
  const pagado_eur = filas.reduce((s, f) => s + f.pagado_eur, 0);
  const saldo_eur = filas.reduce((s, f) => s + f.saldo_eur, 0) + otrosPend.reduce((s, o) => s + o.saldo_eur, 0);
  const vencido_eur = filas.reduce((s, f) => s + f.cuotas.filter((c) => c.vencida).reduce((x, c) => x + c.monto_eur, 0), 0);
  const fmtFecha = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "");

  return {
    camino: dep.name,
    fechas: [fmtFecha(dep.start_date), fmtFecha(dep.end_date)].filter(Boolean).join(" al "),
    generado: fmtFecha(hoy),
    trm,
    filas,
    otros: otrosPend,
    totales: { total_eur, pagado_eur, saldo_eur, saldo_cop: trm ? saldo_eur * trm : null, vencido_eur },
    sinDatos: Array.from(new Set(sinDatos)),
  };
}
