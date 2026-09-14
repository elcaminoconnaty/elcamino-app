import "server-only";
import { RESERVATION_PAYMENT_METHODS, MEDIOS_QUE_SE_GIRAN } from "@/lib/constants";
import { formatearIban, validarIban } from "@/lib/banco";

/**
 * Lo que hay que pagarle a los proveedores, listo para ir al banco.
 *
 * Una fila por **giro**, no por reserva: si un hotel se paga en dos cuotas, son dos
 * transferencias en dos fechas distintas y así es como se hacen de verdad. Cada fila
 * trae los datos sueltos (titular, IBAN, SWIFT, importe, concepto) para copiar y pegar
 * sin tener que abrir nada más.
 *
 * Los datos de pago salen de la **cuenta elegida en la reserva** — que es donde vive la
 * negociación de ese camino — y solo si no hay ninguna se cae a la predeterminada del
 * proveedor. Nunca al revés: el mismo hotel puede cobrar distinto en dos caminos.
 */

export type Giro = {
  reservation_id: string;
  departure_id: string;
  camino: string;
  proveedor: string;
  servicio: string;
  fecha_servicio: string | null;
  estado: string;
  /** "Anticipo 30%", "Saldo", "Resto sin plan"… */
  concepto: string;
  vence: string | null;
  vencida: boolean;
  monto_eur: number;
  /** Si el proveedor no cobra en euros y hay tasa cargada, cuánto se gira en su moneda. */
  monto_moneda: number | null;
  moneda: string;
  medio: string | null;
  medio_label: string;
  /** true para transferencia y Bizum: son los que hay que girar a mano. */
  se_gira: boolean;
  cuenta_origen: string | null;
  cuenta_alias: string | null;
  titular: string | null;
  banco: string | null;
  iban: string | null;
  swift: string | null;
  bizum: string | null;
  /** Qué poner en el concepto de la transferencia. */
  referencia: string | null;
  condicion: string | null;
  notas: string | null;
  /** Qué falta para poder girar esto. Vacío = se puede pagar. */
  faltan: string[];
};

export type OtroPendiente = {
  descripcion: string;
  categoria: string;
  total_eur: number;
  pagado_eur: number;
  saldo_eur: number;
};

export type InformePagos = {
  titulo: string;
  fechas: string;
  generado: string;
  trm: number | null;
  giros: Giro[];
  otros: OtroPendiente[];
  totales: {
    total_eur: number;
    pagado_eur: number;
    saldo_eur: number;
    saldo_cop: number | null;
    vencido_eur: number;
    /** Lo que no se puede girar todavía porque faltan datos. */
    bloqueado_eur: number;
  };
  /** Por medio de pago, para saber cuántas transferencias hay que hacer. */
  porMedio: { medio: string; label: string; cantidad: number; total_eur: number }[];
  /** Advertencias de consistencia (plan de cuotas que no cuadra con el saldo, etc.). */
  avisos: string[];
};

const LABEL_MEDIO = new Map<string, string>(RESERVATION_PAYMENT_METHODS.map((m) => [m.value, m.label]));
const fmtFecha = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "";

/**
 * Qué le falta a un giro para poder hacerse. Es la diferencia entre un informe que se
 * puede pagar y uno que obliga a perseguir datos por WhatsApp.
 */
function datosQueFaltan(medio: string | null, cuenta: any): string[] {
  const faltan: string[] = [];
  if (!medio) faltan.push("medio de pago");
  if (!cuenta && medio && (MEDIOS_QUE_SE_GIRAN as readonly string[]).includes(medio)) {
    faltan.push("cuenta del proveedor");
    return faltan;
  }
  if (!cuenta) return faltan;
  if (medio === "transferencia") {
    if (!cuenta.iban) faltan.push("IBAN");
    else if (validarIban(cuenta.iban)) faltan.push("IBAN válido");
    if (!cuenta.account_holder) faltan.push("titular");
    if (!cuenta.swift_bic) faltan.push("SWIFT/BIC");
  }
  if (medio === "bizum" && !cuenta.bizum_phone) faltan.push("teléfono Bizum");
  if (cuenta.currency && cuenta.currency !== "EUR" && !cuenta.fx_per_eur) {
    faltan.push(`tasa ${cuenta.currency}/EUR`);
  }
  return faltan;
}

function nombreServicio(r: any): string {
  const tipo =
    r.type === "cenas"
      ? r.meal_kind
        ? r.meal_kind[0].toUpperCase() + r.meal_kind.slice(1)
        : "Comida"
      : r.type[0].toUpperCase() + r.type.slice(1);
  return [tipo, r.location ?? null].filter(Boolean).join(" · ");
}

export type OpcionesInforme = {
  /** Un camino, o todos si va vacío. */
  departureId?: string | null;
  /** Solo lo que vence hasta esta fecha (YYYY-MM-DD). Lo sin fecha siempre entra. */
  hasta?: string | null;
};

export async function armarInformePagos(
  supabase: any,
  opciones: OpcionesInforme | string
): Promise<InformePagos | null> {
  // Se sigue pudiendo llamar con el id del camino pelado, como antes.
  const { departureId = null, hasta = null } =
    typeof opciones === "string" ? { departureId: opciones, hasta: null } : opciones;

  const hoy = new Date().toISOString().slice(0, 10);
  const filtrar = (q: any) => (departureId ? q.eq("departure_id", departureId) : q);

  const [{ data: dep }, { data: reservas }, { data: pagos }, { data: cuotas }, { data: otros }, { data: ultimaTrm }] =
    await Promise.all([
      departureId
        ? supabase.from("departures").select("id, name, start_date, end_date, trm_frozen_value").eq("id", departureId).maybeSingle()
        : Promise.resolve({ data: null }),
      filtrar(
        supabase
          .from("reservations")
          .select(
            "id, departure_id, type, location, check_in, status, meal_kind, confirmed_cost_eur, estimated_cost_eur, " +
              "payment_method, pay_from_account, payment_terms, payment_reference, payment_account_id, " +
              "departures(name), " +
              "providers(id, name), " +
              "provider_payment_accounts!reservations_payment_account_id_fkey(alias, method, currency, fx_per_eur, bank_name, account_holder, iban, swift_bic, bizum_phone, notes)"
          )
          .neq("status", "cancelado")
      ).order("check_in", { ascending: true, nullsFirst: false }),
      filtrar(supabase.from("v_reservation_payments").select("reservation_id, paid_eur, saldo_eur, cost_eur")),
      filtrar(
        supabase
          .from("v_reservation_schedule")
          .select("reservation_id, due_date, amount_eur, label, paid")
          .eq("paid", false)
      ).order("due_date"),
      filtrar(
        supabase.from("v_budget_payable").select("description, category, line_total_eur, paid_eur, saldo_eur").is("reservation_id", null)
      ),
      supabase.from("trm_rates").select("eur_cop").order("date", { ascending: false }).limit(1).maybeSingle(),
    ]);

  if (departureId && !dep) return null;

  // Las cuentas predeterminadas, solo para las reservas que no eligieron una.
  const proveedoresSinCuenta = Array.from(
    new Set(((reservas ?? []) as any[]).filter((r) => !r.payment_account_id && r.providers?.id).map((r) => r.providers.id))
  );
  const predeterminada = new Map<string, any>();
  if (proveedoresSinCuenta.length > 0) {
    const { data: defs } = await supabase
      .from("provider_payment_accounts")
      .select("provider_id, alias, method, currency, fx_per_eur, bank_name, account_holder, iban, swift_bic, bizum_phone, notes")
      .in("provider_id", proveedoresSinCuenta)
      .eq("is_default", true)
      .eq("active", true);
    for (const c of defs ?? []) predeterminada.set(c.provider_id, c);
  }

  const pagoDe = new Map<string, any>();
  for (const p of pagos ?? []) pagoDe.set(p.reservation_id, p);
  const cuotasDe = new Map<string, any[]>();
  for (const c of cuotas ?? []) cuotasDe.set(c.reservation_id, [...(cuotasDe.get(c.reservation_id) ?? []), c]);

  const giros: Giro[] = [];
  const avisos: string[] = [];
  let total_eur = 0;
  let pagado_eur = 0;

  for (const r of (reservas ?? []) as any[]) {
    const pago = pagoDe.get(r.id);
    const total = Number(pago?.cost_eur ?? r.confirmed_cost_eur ?? r.estimated_cost_eur ?? 0);
    const pagado = Number(pago?.paid_eur ?? 0);
    const saldo = pago ? Number(pago.saldo_eur ?? 0) : Math.max(total - pagado, 0);
    total_eur += total;
    pagado_eur += pagado;
    if (saldo <= 0.01) continue;

    const prov = r.providers ?? {};
    const cuenta = r.provider_payment_accounts ?? predeterminada.get(prov.id) ?? null;
    const medio = r.payment_method ?? cuenta?.method ?? null;
    const faltan = datosQueFaltan(medio, cuenta);
    const moneda = cuenta?.currency ?? "EUR";
    const fx = Number(cuenta?.fx_per_eur ?? 0) || null;

    const base = {
      reservation_id: r.id,
      departure_id: r.departure_id,
      camino: r.departures?.name ?? dep?.name ?? "—",
      proveedor: prov.name ?? "—",
      servicio: nombreServicio(r),
      fecha_servicio: r.check_in ?? null,
      estado: r.status,
      moneda,
      medio,
      medio_label: medio ? LABEL_MEDIO.get(medio) ?? medio : "Sin medio definido",
      se_gira: medio ? (MEDIOS_QUE_SE_GIRAN as readonly string[]).includes(medio) : false,
      cuenta_origen: r.pay_from_account ?? null,
      cuenta_alias: cuenta?.alias ?? null,
      titular: cuenta?.account_holder ?? null,
      banco: cuenta?.bank_name ?? null,
      iban: cuenta?.iban ? formatearIban(cuenta.iban) : null,
      swift: cuenta?.swift_bic ?? null,
      bizum: cuenta?.bizum_phone ?? null,
      referencia: r.payment_reference ?? null,
      condicion: r.payment_terms ?? null,
      notas: cuenta?.notes ?? null,
      faltan,
    };

    const pendientes = cuotasDe.get(r.id) ?? [];
    const sumaCuotas = pendientes.reduce((s, c) => s + Number(c.amount_eur ?? 0), 0);

    const agregar = (concepto: string, vence: string | null, monto: number) => {
      giros.push({
        ...base,
        concepto,
        vence,
        vencida: vence != null && vence < hoy,
        monto_eur: monto,
        monto_moneda: moneda !== "EUR" && fx ? monto * fx : null,
      });
    };

    if (pendientes.length === 0) {
      agregar("Saldo pendiente", null, saldo);
    } else {
      for (const c of pendientes) {
        agregar(c.label || "Cuota", String(c.due_date), Number(c.amount_eur ?? 0));
      }
      const resto = saldo - sumaCuotas;
      if (resto > 0.01) agregar("Resto sin plan", null, resto);
      else if (resto < -0.01) {
        avisos.push(
          `${base.proveedor} · ${base.servicio}: el plan de cuotas suma ${sumaCuotas.toFixed(2)} € y el saldo es ${saldo.toFixed(2)} €. Revisá el plan.`
        );
      }
    }
  }

  const dentroDePlazo = hasta ? giros.filter((g) => !g.vence || g.vence <= hasta) : giros;

  const otrosPend: OtroPendiente[] = ((otros ?? []) as any[])
    .filter((b) => Number(b.saldo_eur ?? 0) > 0.01)
    .map((b) => ({
      descripcion: b.description,
      categoria: b.category,
      total_eur: Number(b.line_total_eur ?? 0),
      pagado_eur: Number(b.paid_eur ?? 0),
      saldo_eur: Number(b.saldo_eur ?? 0),
    }));

  const trm = Number(dep?.trm_frozen_value ?? ultimaTrm?.eur_cop ?? 0) || null;
  const saldoGiros = dentroDePlazo.reduce((s, g) => s + g.monto_eur, 0);
  const saldo_eur = saldoGiros + otrosPend.reduce((s, o) => s + o.saldo_eur, 0);
  const vencido_eur = dentroDePlazo.filter((g) => g.vencida).reduce((s, g) => s + g.monto_eur, 0);
  const bloqueado_eur = dentroDePlazo.filter((g) => g.faltan.length > 0).reduce((s, g) => s + g.monto_eur, 0);

  const porMedio = Array.from(
    dentroDePlazo.reduce((m, g) => {
      const k = g.medio ?? "sin_definir";
      const prev = m.get(k) ?? { medio: k, label: g.medio_label, cantidad: 0, total_eur: 0 };
      m.set(k, { ...prev, cantidad: prev.cantidad + 1, total_eur: prev.total_eur + g.monto_eur });
      return m;
    }, new Map<string, { medio: string; label: string; cantidad: number; total_eur: number }>()).values()
  ).sort((a, b) => b.total_eur - a.total_eur);

  return {
    titulo: dep?.name ?? "Todos los caminos",
    fechas: dep ? [fmtFecha(dep.start_date), fmtFecha(dep.end_date)].filter(Boolean).join(" al ") : "",
    generado: fmtFecha(hoy),
    trm,
    giros: dentroDePlazo,
    otros: otrosPend,
    totales: {
      total_eur,
      pagado_eur,
      saldo_eur,
      saldo_cop: trm ? saldo_eur * trm : null,
      vencido_eur,
      bloqueado_eur,
    },
    porMedio,
    avisos,
  };
}
