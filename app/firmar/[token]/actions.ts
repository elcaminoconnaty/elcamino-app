"use server";

import { headers } from "next/headers";
import { firmarContrato, pedirCodigo, type Huella } from "@/lib/contracts/sign";

/**
 * Las acciones de la página pública de firma.
 *
 * La huella (IP y dispositivo) se lee acá, en el servidor, y no se acepta del cliente:
 * un dato de evidencia que el firmante puede escribir no vale nada.
 */
function huellaDelPedido(): Huella {
  const h = headers();
  // Railway pone la IP real en x-forwarded-for; el primer valor es el cliente.
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

export async function accionPedirCodigo(token: string) {
  return pedirCodigo(token, huellaDelPedido());
}

export async function accionFirmar(args: {
  token: string;
  codigo: string;
  trazoDataUrl: string;
  aceptaLectura: boolean;
  aceptaFirma: boolean;
  geo?: string | null;
}) {
  return firmarContrato({ ...args, huella: huellaDelPedido() });
}
