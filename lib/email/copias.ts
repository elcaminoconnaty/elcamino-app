import "server-only";

/**
 * A quién más le llega el correo de un proveedor. Sale de `providers.cc_emails` —el Pazo
 * Santa María pide copia a reservas@fontedopicho.com— y el diálogo de envío puede
 * cambiarlo para un envío puntual.
 *
 * Ojo con no confundirlo con `alt_emails`: esas son direcciones viejas o de otro
 * interlocutor que sirven para *encontrar* el hilo, y no deben recibir nada.
 */
export function copiasDelProveedor(
  proveedor: { cc_emails?: string[] | null } | null | undefined,
  destinatario: string | null,
  anulacion?: string[] | null
): string[] {
  const crudas = anulacion ?? proveedor?.cc_emails ?? [];
  const principal = String(destinatario ?? "").trim().toLowerCase();
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const c of crudas) {
    const dir = String(c ?? "").trim();
    const clave = dir.toLowerCase();
    if (!dir || clave === principal || vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(dir);
  }
  return salida;
}
