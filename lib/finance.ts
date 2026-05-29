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

// Costo efectivo de un budget_item según su escala. Única fórmula compartida por
// el presupuesto, el resumen y los prorrateos — debe coincidir con v_departure_finance.
export function effectiveLineTotal(
  item: { scaling?: string | null; confirmed_unit_cost_eur?: number | null; estimated_unit_cost_eur?: number | null; quantity?: number | null },
  pagantes: number,
  team: number
): number {
  const unit = Number(item.confirmed_unit_cost_eur ?? item.estimated_unit_cost_eur ?? 0);
  const qty = Number(item.quantity ?? 1);
  switch (item.scaling) {
    case "por_inscrito":
      return unit * (pagantes + team);
    case "por_pagante":
      return unit * pagantes;
    case "fijo_grupo":
    case "viatico_team":
    default:
      return unit * qty;
  }
}

export function computeBreakEven(f: DepartureFinance): { n: number | null; reachable: boolean } {
  const price = f.precio_promedio_pagante_eur ?? 0;
  if (price <= 0) return { n: null, reachable: false };
  const costoMarginalPorPagante = f.por_inscrito_unit_eur + f.por_pagante_unit_eur;
  const margenContribucion = price - costoMarginalPorPagante;
  if (margenContribucion <= 0) return { n: null, reachable: false };
  const costosFijosTotal = f.fijo_grupo_eur + f.viatico_team_eur + f.por_inscrito_unit_eur * f.team_count;
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

  const costoTotal = fijo + inscritoUnit * inscritos + pagUnit * nPagantes + viatico;
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
    color: "bg-blue-100 text-blue-900",
    description: "Costo total del grupo, no escala con peregrinos (ej. alojamiento del grupo, bus completo)",
  },
  por_inscrito: {
    label: "Por inscrito",
    color: "bg-purple-100 text-purple-900",
    description: "Escala con cada persona que duerme en el camino — pagantes + equipo (ej. cama por persona)",
  },
  por_pagante: {
    label: "Por pagante",
    color: "bg-green-100 text-green-900",
    description: "Solo escala con peregrinos pagantes (ej. credenciales, seguros, materiales)",
  },
  viatico_team: {
    label: "Viático equipo",
    color: "bg-amber-100 text-amber-900",
    description: "Costo personal de Naty + Nico para ir al camino (vuelos, hoteles Madrid, comidas)",
  },
};
