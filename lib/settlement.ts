import { GLOBAL66 } from "@/lib/constants";

/**
 * Liquidación final a la tasa de cierre.
 *
 * Los peregrinos abonan durante el año y cada abono en pesos se convierte a EUR
 * con la tasa del día. Un mes antes de la salida se fija la **tasa de cierre** y
 * todos los pagos que se quedaron en pesos se re-valoran con ella: el precio del
 * viaje está en euros, así que lo que define cuánto falta (o cuánto sobró) es
 * cuántos euros valen hoy los pesos que ya entregó.
 *
 * Nada de esto modifica los pagos: cada uno conserva su monto, su tasa del día y
 * su `amount_eur` real, que es la caja que efectivamente entró. El recálculo vive
 * en `v_pilgrim_settlement` y acá solo se lee.
 *
 * Global 66 no se re-valora: ahí los pesos se cambian a euros en el momento del
 * pago, así que ese euro ya quedó fijado. Solo se re-valora la plata que se quedó
 * en pesos (Bancolombia, Nequi, efectivo en COP).
 *
 * Cada camino elige su modo (`SettlementMode`): la modalidad de siempre es con
 * recálculo, pero un camino puede liquidarse `sin_recalculo` y entonces no hay
 * tasa de cierre ni diferencia en cambio — el saldo es lo acordado menos lo
 * abonado. El último pago y las devoluciones funcionan igual en los dos modos.
 */

export type EstadoLiquidacion = "sin_tasa" | "por_cobrar" | "por_devolver" | "liquidado" | "devuelto";

export type PaymentKind = "abono" | "cierre" | "devolucion";

/**
 * Modo de liquidación del camino.
 * - `recalculo`: la modalidad de siempre — un mes antes se fija la tasa de cierre
 *   y los abonos que se quedaron en pesos se re-valoran con ella.
 * - `sin_recalculo`: no hay re-valoración. Cada abono vale los euros que valió el
 *   día que se hizo y el saldo es lo acordado menos lo abonado.
 */
export type SettlementMode = "recalculo" | "sin_recalculo";

export const SETTLEMENT_MODE: Record<SettlementMode, { label: string; short: string; description: string }> = {
  recalculo: {
    label: "Con recálculo a la tasa de cierre",
    short: "Con recálculo",
    description:
      "Un mes antes del viaje fijás la tasa de cierre y todos los abonos hechos en pesos se re-valoran con ella. De ahí sale el último pago, o la devolución de quien pagó de más.",
  },
  sin_recalculo: {
    label: "Sin recálculo de tasa",
    short: "Sin recálculo",
    description:
      "Cada abono vale los euros que valió el día que se hizo y no se re-valora nunca. El saldo es el total acordado menos lo abonado. No hay tasa de cierre ni diferencia en cambio.",
  },
};

/** Tolerancia: el cobro en pesos va en pesos enteros y cada `amount_eur` está
 *  redondeado a centavos, así que un residuo por debajo de esto no es saldo. */
export const TOLERANCIA_EUR = 0.5;

export type PilgrimSettlement = {
  registration_id: string;
  departure_id: string;
  pilgrim_id: string;
  pilgrim_name: string;
  is_team: boolean;
  departure_name: string;
  start_date: string | null;
  status: string;
  /** total_eur − discount_eur + penalty_eur. */
  net_total_eur: number;
  /** Penalidad en EUR ya incluida en `net_total_eur` (p. ej. por cambio de camino). */
  penalty_eur: number;
  penalty_note: string | null;
  /** Tasa de cierre con la que se re-valoran los pagos en pesos. */
  settlement_trm: number | null;
  settlement_date: string | null;
  /** "salida" = la del grupo · "inscripcion" = excepción pactada con este peregrino. */
  settlement_source: "salida" | "inscripcion" | null;
  settlement_mode: SettlementMode;
  /** Euros que realmente entraron (caja real, suma de los pagos como se hicieron). */
  paid_eur_historico: number;
  /** Euros que se le acreditan al peregrino con los pagos re-valorados. */
  paid_eur_cierre: number;
  /** paid_eur_cierre − paid_eur_historico. Positivo = el negocio absorbe la diferencia. */
  fx_difference_eur: number;
  cop_revalorado: number;
  eur_fijo: number;
  pending_eur_historico: number;
  /** Positivo = falta cobrar · negativo = hay que devolver. */
  saldo_final_eur: number;
  saldo_final_cop: number | null;
  total_cop_cierre: number | null;
  por_cobrar_eur: number;
  por_cobrar_cop: number | null;
  por_devolver_eur: number;
  por_devolver_cop: number | null;
  devuelto_eur: number;
  devuelto_cop: number;
  pagos_cierre: number;
  acreditado_eur: number;
  estado_liquidacion: EstadoLiquidacion;
};

export type PaymentSettlement = {
  id: string;
  registration_id: string;
  paid_at: string;
  amount: number;
  currency: "EUR" | "COP" | "USD";
  trm_eur_cop: number | null;
  usd_eur_rate: number | null;
  amount_eur: number | null;
  method: string | null;
  account: string | null;
  reference: string | null;
  notes: string | null;
  kind: PaymentKind;
  settlement_trm: number | null;
  se_revalora: boolean;
  amount_eur_cierre: number | null;
  fx_diff_eur: number;
};

export const ESTADO_LIQUIDACION: Record<
  EstadoLiquidacion,
  { label: string; badge: "muted" | "success" | "warning" | "accent" | "destructive"; help: string }
> = {
  sin_tasa: {
    label: "Falta la tasa de cierre",
    badge: "muted",
    help: "Este camino liquida con recálculo, pero todavía no se fijó la tasa de cierre. Mientras tanto el saldo que se muestra es el histórico.",
  },
  por_cobrar: {
    label: "Por cobrar",
    badge: "warning",
    help: "Falta este último pago para completar el viaje a la tasa de cierre.",
  },
  por_devolver: {
    label: "Por devolver",
    badge: "accent",
    help: "Pagó de más al recalcular a la tasa de cierre. Hay que girarle la diferencia.",
  },
  liquidado: {
    label: "Al día",
    badge: "success",
    help: "El viaje quedó pagado completo.",
  },
  devuelto: {
    label: "Devuelto",
    badge: "success",
    help: "Se le giró la diferencia y el saldo quedó en cero.",
  },
};

export const PAYMENT_KIND: Record<PaymentKind, { label: string; short: string }> = {
  abono: { label: "Abono", short: "Abono" },
  cierre: { label: "Pago de cierre", short: "Cierre" },
  devolucion: { label: "Devolución", short: "Devolución" },
};

/** Misma regla que `payment_fx_recalc` en la BD: qué pagos se re-valoran. */
export function seRevalora(
  currency: string | null | undefined,
  method: string | null | undefined,
  explicit?: boolean | null
): boolean {
  if (explicit != null) return explicit;
  return currency === "COP" && (method ?? "") !== GLOBAL66;
}

/** Por qué un pago no entra al recálculo — para explicarlo en la UI y el PDF. */
export function motivoSinRecalculo(currency: string | null | undefined, method: string | null | undefined): string {
  if (method === GLOBAL66) return `${GLOBAL66} cambió a euros el mismo día`;
  if (currency === "EUR") return "Ya estaba en euros";
  if (currency === "USD") return "Cambiado a euros el día del pago";
  return "No se re-valora";
}

/** Los pesos a cobrar (o a devolver) van en pesos enteros. */
export function copRedondeado(eur: number, trm: number): number {
  return Math.round(eur * trm);
}

/**
 * Lo que hay que registrar para cerrar una inscripción: el último pago o la
 * devolución. `cop` solo viene cuando hay tasa de cierre con la que expresarlo.
 * Devuelve null cuando ya quedó en cero, o cuando falta fijar la tasa.
 */
export function movimientoDeCierre(s: PilgrimSettlement): {
  kind: "cierre" | "devolucion";
  /** Siempre positivo. */
  eur: number;
  cop: number | null;
} | null {
  if (s.estado_liquidacion === "sin_tasa") return null;
  const trm = s.settlement_trm && s.settlement_trm > 0 ? Number(s.settlement_trm) : null;
  if (s.por_cobrar_eur > 0) {
    return { kind: "cierre", eur: s.por_cobrar_eur, cop: trm ? copRedondeado(s.por_cobrar_eur, trm) : null };
  }
  if (s.por_devolver_eur > 0) {
    return { kind: "devolucion", eur: s.por_devolver_eur, cop: trm ? copRedondeado(s.por_devolver_eur, trm) : null };
  }
  return null;
}
