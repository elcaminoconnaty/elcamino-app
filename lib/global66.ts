import { GLOBAL66 } from "@/lib/constants";

/**
 * Global 66 cambia COP a EUR con su propia tasa (comisión incluida), que no es
 * la TRM del día. La tasa efectiva sale de los pesos pagados / euros recibidos y
 * se guarda en `trm_eur_cop` (COP por EUR), que es como toda la plataforma
 * expresa el cambio; así `amount_eur` queda exactamente en los euros reales.
 */
export function global66Rate(cop: number, eur: number): number | null {
  if (!cop || !eur || cop <= 0 || eur <= 0) return null;
  return cop / eur;
}

/**
 * Sin tasa el trigger de la BD caería en la TRM del día y el euro quedaría mal,
 * así que un movimiento en COP por Global 66 no se guarda sin ella.
 */
export function assertGlobal66Rate(
  method: string | null | undefined,
  currency: string | null | undefined,
  trm: number | null | undefined
) {
  if (method === GLOBAL66 && currency === "COP" && (!trm || trm <= 0)) {
    throw new Error(`Para movimientos por ${GLOBAL66} indicá los euros de la operación (de ahí sale la tasa).`);
  }
}
