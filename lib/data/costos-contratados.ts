import "server-only";
import type { createClient } from "@/lib/supabase/server";

/**
 * Lo que se le debe a los proveedores según lo CONTRATADO, por camino. Es la misma cuenta del
 * informe de giros y de las filas de la pestaña Pagos: cada reserva no cancelada con su costo
 * (confirmado, o estimado si aún no hay), más los ítems del presupuesto que no son reserva
 * (viáticos, tiquetes…).
 *
 * El costo del camino que se usa para la utilidad es otro: el de los inscritos actuales
 * (v_departure_finance), porque Nico ajusta las camas a la gente que va. Este de acá es
 * "comprometido hoy": lo que costaría si no se inscribe nadie más y no se cancela nada.
 * "Falta por pagar" sale SIEMPRE de acá: es plata que se debe.
 */
export type Contratado = { comprometido: number; pagado: number; falta: number };

export async function contratadoPorCamino(
  supabase: ReturnType<typeof createClient>,
  departureId?: string | null
): Promise<Map<string, Contratado>> {
  const filtrar = (q: any) => (departureId ? q.eq("departure_id", departureId) : q);
  const [{ data: reservas }, { data: pagosReserva }, { data: sinReserva }] = await Promise.all([
    filtrar(supabase.from("reservations").select("id, departure_id").neq("status", "cancelado")),
    filtrar(supabase.from("v_reservation_payments").select("reservation_id, departure_id, cost_eur, paid_eur, saldo_eur")),
    filtrar(supabase.from("v_budget_payable").select("departure_id, line_total_eur, paid_eur, saldo_eur").is("reservation_id", null)),
  ]);
  const vivas = new Set(((reservas ?? []) as any[]).map((r) => r.id));
  const salida = new Map<string, Contratado>();
  const sumar = (dep: string, costo: number, pagado: number, falta: number) => {
    const c = salida.get(dep) ?? { comprometido: 0, pagado: 0, falta: 0 };
    c.comprometido += costo;
    c.pagado += pagado;
    c.falta += falta;
    salida.set(dep, c);
  };
  for (const p of (pagosReserva ?? []) as any[]) {
    if (!vivas.has(p.reservation_id)) continue;
    sumar(p.departure_id, Number(p.cost_eur ?? 0), Number(p.paid_eur ?? 0), Number(p.saldo_eur ?? 0));
  }
  for (const b of (sinReserva ?? []) as any[]) {
    sumar(b.departure_id, Number(b.line_total_eur ?? 0), Number(b.paid_eur ?? 0), Number(b.saldo_eur ?? 0));
  }
  return salida;
}
