"use server";

import { urlSubidaPasaporte, leerPasaporte, enviarFormulario, solicitarInscripcion, type DatosFormulario } from "@/lib/registro/por-token";

/** Las acciones del formulario público de inscripción. Todo se autoriza por el token del camino. */
export async function accionUrlPasaporte(args: { token: string; registrationId: string; filename: string }) {
  return urlSubidaPasaporte(args.token, args.registrationId, args.filename);
}

export async function accionLeerPasaporte(args: { token: string; registrationId: string; path: string }) {
  return leerPasaporte(args.token, args.registrationId, args.path);
}

export async function accionEnviarFormulario(args: { token: string; registrationId: string; datos: DatosFormulario }) {
  return enviarFormulario(args.token, args.registrationId, args.datos);
}

export async function accionSolicitar(args: { token: string; datos: { full_name: string; email: string; phone: string; mensaje?: string | null } }) {
  return solicitarInscripcion(args.token, args.datos);
}
