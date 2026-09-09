"use server";

import { guardarEleccionPorToken, marcarNoCenaPorToken } from "@/lib/menus/por-token";

/** Las acciones de la página pública de elección de menú. Todo se autoriza por el token. */
export async function accionElegir(args: { token: string; reservationId: string; courseId: string; optionId: string | null }) {
  return guardarEleccionPorToken(args);
}

export async function accionNoCena(args: { token: string; reservationId: string; noCena: boolean }) {
  return marcarNoCenaPorToken(args);
}
