"use server";

import { guardarEleccionPorAcceso, marcarNoCenaPorAcceso } from "@/lib/menus/por-token";

/**
 * Las acciones del enlace del camino. El `registrationId` lo manda el cliente (es a quien
 * eligió en la lista); el servidor comprueba que sea una inscripción de ese camino.
 */
export async function accionElegirCamino(args: { token: string; registrationId: string; reservationId: string; courseId: string; optionId: string | null }) {
  return guardarEleccionPorAcceso(args);
}

export async function accionNoCenaCamino(args: { token: string; registrationId: string; reservationId: string; noCena: boolean }) {
  return marcarNoCenaPorAcceso(args);
}
