export type DepartureFinance = {
  departure_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  capacity: number | null;
  pagantes_count: number;
  team_count: number;
  inscritos_total: number;
  expected_revenue_eur: number;
  collected_revenue_eur: number;
  pending_revenue_eur: number;
  fijo_grupo_eur: number;
  por_inscrito_unit_eur: number;
  por_pagante_unit_eur: number;
  viatico_team_eur: number;
  costo_por_inscrito_eur: number;
  costo_por_pagante_total_eur: number;
  costo_total_eur: number;
  costo_por_pagante_unitario_eur: number | null;
  precio_promedio_pagante_eur: number | null;
  utilidad_total_eur: number;
  utilidad_por_pagante_eur: number | null;
  costo_peregrinos_eur: number;
  costo_equipo_eur: number;
  variable_buffer_pct: number;
  trm_frozen_at_date: string | null;
  trm_frozen_value: number | null;
  /** Pendiente por cobrar ya liquidado a la tasa de cierre — ver lib/settlement.ts. */
  pending_settled_eur: number;
  /** Lo que hay que girarle de vuelta a los peregrinos que pagaron de más. */
  por_devolver_eur: number;
  /** Hueco entre el precio acordado y la caja real por el movimiento de la tasa. */
  fx_difference_eur: number;
  /** Cuántas inscripciones ya tienen tasa de cierre. */
  liquidados_count: number;
  /** "recalculo" | "sin_recalculo" — ver lib/settlement.ts. */
  settlement_mode: string;
};

export type Scenario = {
  pagantes: number;
  team_count: number;
  costo_total_eur: number;
  costo_por_pagante_eur: number | null;
  ingreso_proyectado_eur: number;
  utilidad_total_eur: number;
  utilidad_por_pagante_eur: number | null;
};

// Costo efectivo de un budget_item según su escala. Es la MISMA regla de v_departure_finance
// y v_budget_payable (la base manda; esto la replica para el presupuesto que se edita en vivo):
//   por_inscrito → costo × (pagantes + equipo) × (1 + contingencia)   (camas y servicios de todos)
//   por_pagante  → costo × pagantes × (1 + contingencia)              (lo personal del que paga)
//   fijo_grupo y viatico_team → costo × cantidad
// Antes acá por_pagante multiplicaba también al equipo y no había contingencia: el Presupuesto
// sumaba 18.920,56 € y la tarjeta "Total" de al lado, 19.545,89 € (auditoría 2026-09-29).
export function effectiveLineTotal(
  item: { scaling?: string | null; confirmed_unit_cost_eur?: number | null; estimated_unit_cost_eur?: number | null; quantity?: number | null },
  pagantes: number,
  team: number,
  contingenciaPct = 0
): number {
  const unit = Number(item.confirmed_unit_cost_eur ?? item.estimated_unit_cost_eur ?? 0);
  const qty = Number(item.quantity ?? 1);
  const factor = 1 + Number(contingenciaPct || 0) / 100;
  switch (item.scaling) {
    case "por_inscrito":
      return unit * (pagantes + team) * factor;
    case "por_pagante":
      return unit * pagantes * factor;
    case "fijo_grupo":
    case "viatico_team":
    default:
      return unit * qty;
  }
}

export function computeBreakEven(f: DepartureFinance): { n: number | null; reachable: boolean } {
  const price = f.precio_promedio_pagante_eur ?? 0;
  if (price <= 0) return { n: null, reachable: false };
  const factor = 1 + Number(f.variable_buffer_pct ?? 0) / 100; // % de contingencia sobre variables por persona
  const costoMarginalPorPagante = (Number(f.por_inscrito_unit_eur) + Number(f.por_pagante_unit_eur)) * factor;
  const margenContribucion = price - costoMarginalPorPagante;
  if (margenContribucion <= 0) return { n: null, reachable: false };
  // Costos fijos = fijo grupo + viáticos + las camas y servicios del equipo (solo por_inscrito: lo
  // "por pagante" es de quien paga, igual que en v_departure_finance).
  const costosFijosTotal = Number(f.fijo_grupo_eur) + Number(f.viatico_team_eur) + Number(f.por_inscrito_unit_eur) * f.team_count * factor;
  const n = Math.ceil(costosFijosTotal / margenContribucion);
  const reachable = f.capacity == null || n <= f.capacity;
  return { n, reachable };
}

export function simulateScenario(f: DepartureFinance, nPagantes: number): Scenario {
  const team = f.team_count;
  const inscritos = nPagantes + team;
  const fijo = Number(f.fijo_grupo_eur);
  const inscritoUnit = Number(f.por_inscrito_unit_eur);
  const pagUnit = Number(f.por_pagante_unit_eur);
  const viatico = Number(f.viatico_team_eur);
  const price = Number(f.precio_promedio_pagante_eur ?? 0);

  // La misma regla de v_departure_finance: camas y servicios × (pagantes + equipo), lo personal ×
  // pagantes, los dos con la contingencia. Así el escenario "hoy" da la utilidad del camino al centavo.
  const factor = 1 + Number(f.variable_buffer_pct ?? 0) / 100;
  const costoTotal = fijo + (inscritoUnit * inscritos + pagUnit * nPagantes) * factor + viatico;
  const ingreso = price * nPagantes;
  const utilidad = ingreso - costoTotal;

  return {
    pagantes: nPagantes,
    team_count: team,
    costo_total_eur: costoTotal,
    costo_por_pagante_eur: nPagantes > 0 ? costoTotal / nPagantes : null,
    ingreso_proyectado_eur: ingreso,
    utilidad_total_eur: utilidad,
    utilidad_por_pagante_eur: nPagantes > 0 ? utilidad / nPagantes : null,
  };
}

export const SCALING_LABELS: Record<string, { label: string; color: string; description: string }> = {
  fijo_grupo: {
    label: "Fijo grupo",
    color: "bg-info-100 text-info-900",
    description: "Costo total del grupo, no escala con peregrinos (ej. alojamiento del grupo, bus completo)",
  },
  por_inscrito: {
    label: "Por inscrito",
    color: "bg-purple-100 text-purple-900",
    description: "Escala con cada persona que duerme en el camino — pagantes + equipo (ej. cama por persona)",
  },
  por_pagante: {
    label: "Por pagante",
    color: "bg-ok-100 text-ok-900",
    description: "Ítems por persona (credenciales, seguros, materiales). Los consumen todos los inscritos, incluido el equipo",
  },
  viatico_team: {
    label: "Viático equipo",
    color: "bg-aviso-100 text-aviso-900",
    description: "Costo personal de Naty + Nico para ir al camino (vuelos, hoteles Madrid, comidas)",
  },
};

/**
 * Utilidad según cuántos paguen, desde los inscritos de hoy hasta llenar el cupo.
 *
 * Supone lo que hace Nico: las camas y servicios se ajustan a los inscritos (las alertas de
 * "sobran camas" avisan cuándo cancelar), así que el costo sigue el modelo por persona. El
 * ingreso de hoy es el esperado real (cada uno con su precio y descuento) y cada peregrino
 * nuevo entra con el precio de lista del camino (`departures.base_price_eur`), o con el
 * promedio si no hay precio de lista.
 */
export type FilaCupo = {
  pagantes: number;
  ingreso_eur: number;
  costo_eur: number;
  utilidad_eur: number;
  /** Cuánto suma a la utilidad este peregrino respecto a la fila anterior. */
  suma_eur: number | null;
  utilidad_por_pagante_eur: number | null;
  hoy: boolean;
};

export function tablaPorCupo(f: DepartureFinance, precioLista: number | null | undefined): FilaCupo[] {
  const hoy = Number(f.pagantes_count ?? 0);
  const precio = Number(precioLista ?? 0) > 0 ? Number(precioLista) : Number(f.precio_promedio_pagante_eur ?? 0);
  const tope = f.capacity && f.capacity > hoy ? f.capacity : hoy + 8;
  const filas: FilaCupo[] = [];
  for (let n = Math.max(hoy, 1); n <= tope; n++) {
    const costo = simulateScenario(f, n).costo_total_eur;
    const ingreso = Number(f.expected_revenue_eur ?? 0) + (n - hoy) * precio;
    const utilidad = ingreso - costo;
    const anterior = filas[filas.length - 1];
    filas.push({
      pagantes: n,
      ingreso_eur: ingreso,
      costo_eur: costo,
      utilidad_eur: utilidad,
      suma_eur: anterior ? utilidad - anterior.utilidad_eur : null,
      utilidad_por_pagante_eur: n > 0 ? utilidad / n : null,
      hoy: n === hoy,
    });
  }
  return filas;
}
