/**
 * La fecha de un día de la ruta (`route_stages.day_offset`) para un camino que empieza en
 * `inicio` (`departures.start_date`, el primer día caminando).
 *
 * Convención de la plataforma (ver `dateForOffset` en lib/actions/route-template.ts): el día
 * 1 es `inicio` y no existe el 0, así que −1 es la víspera. Pero hay rutas cargadas CON día 0
 * (el Portugués: −1 llegan Nico y Naty, 0 es el encuentro); en esas el 0 hace de víspera y
 * todo lo anterior se corre uno. Se decide por ruta con `hayDiaCero`.
 *
 * Se cuenta por offset y no por posición, para que un día que falte en la ruta no corra
 * todas las fechas siguientes. Puro y en UTC a mediodía: sin líos de zona horaria.
 */
export function fechaDeDia(inicio: string, dayOffset: number, hayDiaCero: boolean): string {
  const corrimiento = dayOffset > 0 ? dayOffset - 1 : hayDiaCero ? dayOffset - 1 : dayOffset;
  const f = new Date(`${inicio}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + corrimiento);
  return f.toISOString().slice(0, 10);
}

/** ¿La ruta trae un día 0? Decide cómo se cuentan los días previos al primero caminando. */
export const tieneDiaCero = (etapas: Array<{ day_offset: number }>) => etapas.some((e) => e.day_offset === 0);
