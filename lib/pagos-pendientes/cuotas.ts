/**
 * Cuánto falta de cada cuota del plan de pagos a un proveedor, derivado de lo que de verdad se
 * le pagó a esa reserva — no de la casilla `paid` de la cuota.
 *
 * Por qué: la casilla solo se marcaba si el pago se registraba desde el diálogo con plan. Pagos
 * hechos de otra forma dejaban la cuota "sin pagar" para siempre, y el camino mostraba alertas
 * de "Pago VENCIDO" por 4.795 € en reservas ya pagadas (auditoría 2026-09-29). Y un plan mal
 * cargado (cuotas que suman más que el costo) hacía que el informe pidiera girar de más.
 *
 * Regla (la misma cascada que las cuotas de los peregrinos en v_installment_status): lo pagado
 * se aplica a las cuotas por orden de vencimiento, y lo que queda nunca supera el saldo real
 * de la reserva (costo − pagado). Una sola función para las alertas y para el informe de giros.
 */
export type CuotaPlan = { reservation_id: string; due_date: string | null; amount_eur: number | string | null };

export function cuotasPendientes<T extends CuotaPlan>(
  cuotas: T[],
  pagadoPorReserva: Map<string, number>,
  saldoPorReserva: Map<string, number>
): (T & { restante_eur: number })[] {
  const porReserva = new Map<string, T[]>();
  for (const c of cuotas) porReserva.set(c.reservation_id, [...(porReserva.get(c.reservation_id) ?? []), c]);

  const salida: (T & { restante_eur: number })[] = [];
  for (const [reservationId, lista] of Array.from(porReserva.entries())) {
    const ordenadas = [...lista].sort((a, b) => String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999")));
    let porAplicar = pagadoPorReserva.get(reservationId) ?? 0;
    let saldo = Math.max(saldoPorReserva.get(reservationId) ?? 0, 0);
    for (const c of ordenadas) {
      const monto = Number(c.amount_eur ?? 0);
      const cubierto = Math.min(monto, Math.max(porAplicar, 0));
      porAplicar -= cubierto;
      const restante = Math.round(Math.min(monto - cubierto, saldo) * 100) / 100;
      saldo -= Math.max(restante, 0);
      if (restante > 0.01) salida.push({ ...c, restante_eur: restante });
    }
  }
  return salida.sort((a, b) => String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999")));
}
