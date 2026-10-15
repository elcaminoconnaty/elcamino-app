import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarContratosMasivo, previsualizarEnvioMasivo } from "@/lib/actions/contracts-bulk";

/**
 * Lo que el asistente puede HACER, no solo consultar.
 *
 * Regla: **el asistente propone, la persona confirma.** Cada acción tiene dos mitades:
 *   - `preparar`: la llama el agente. No toca nada afuera; arma la lista exacta de lo que
 *     pasaría (a quién, qué, quién se omite y por qué) y la guarda en `assistant_actions`
 *     como 'propuesta'. El chat la muestra como una tarjeta con su botón.
 *   - `ejecutar`: la llama `/api/asistente/acciones/[id]` cuando la MISMA persona toca
 *     Confirmar. Corre con su sesión, así que el autor de todo lo que pase es ella.
 *
 * Así el modelo nunca manda un correo por su cuenta, y lo que se ejecuta es exactamente lo
 * que la persona vio, no lo que el modelo recalcule después.
 *
 * Para agregar una acción nueva: una entrada en ACCIONES y una herramienta en agente.ts.
 */

export type FilaVista = { nombre: string; email: string | null; hara: string; ok: boolean };

export type VistaAccion = {
  id: string;
  kind: string;
  status: "propuesta" | "ejecutando" | "ejecutada" | "fallida" | "cancelada";
  titulo: string;
  detalle: string;
  filas: FilaVista[];
  ejecutables: number;
  boton: string;
  resultado?: { resumen: string; filas: FilaVista[] } | null;
};

type Preview = Omit<VistaAccion, "id" | "kind" | "status" | "resultado">;

type Accion<P> = {
  ejecutar(params: P): Promise<{ ok: boolean; resumen: string; filas: FilaVista[] }>;
};

// --- Enviar / reenviar contratos a firmar ------------------------------------------------

type ParamsContratos = { departure_id: string; registration_ids: string[] };

export async function prepararEnvioContratos(
  supabase: SupabaseClient,
  conversationId: string,
  departureId: string,
  registrationIds: string[]
): Promise<{ vista: VistaAccion } | { error: string }> {
  const { data: camino } = await supabase.from("departures").select("id, name").eq("id", departureId).maybeSingle();
  if (!camino) return { error: `No existe un camino con id ${departureId}.` };

  const previa = await previsualizarEnvioMasivo(departureId);
  const pedidas = new Set(registrationIds);
  const elegidas = previa.filter((p) => pedidas.has(p.registrationId));
  const ajenas = registrationIds.filter((id) => !previa.some((p) => p.registrationId === id));
  if (elegidas.length === 0) {
    return {
      error: `Ninguna de esas inscripciones es un peregrino activo de ${camino.name}. Usá registrations.id (no pilgrims.id) del mismo camino.`,
    };
  }

  const ejecutables = elegidas.filter((p) => p.accion !== "omitir");
  const preview: Preview = {
    titulo: `Contratos a firmar · ${camino.name}`,
    detalle:
      ejecutables.length === 0
        ? "No hay a quién enviarle: todos se omiten."
        : `Se le manda el enlace de firma por correo a ${ejecutables.length} ${ejecutables.length === 1 ? "persona" : "personas"}.` +
          (ajenas.length ? ` (${ajenas.length} id${ajenas.length === 1 ? "" : "s"} no eran de este camino y se ignoraron.)` : ""),
    filas: elegidas.map((p) => ({
      nombre: p.nombre,
      email: p.email,
      hara: p.accion === "omitir" ? `No se envía: ${p.motivo}` : p.accion === "reenviar" ? "Reenviar enlace de firma" : "Generar contrato y enviarlo",
      ok: p.accion !== "omitir",
    })),
    ejecutables: ejecutables.length,
    boton: `Enviar ${ejecutables.length} ${ejecutables.length === 1 ? "contrato" : "contratos"}`,
  };
  const params: ParamsContratos = { departure_id: departureId, registration_ids: ejecutables.map((p) => p.registrationId) };

  const { data, error } = await supabase
    .from("assistant_actions")
    .insert({ conversation_id: conversationId, kind: "enviar_contratos", params, preview })
    .select("id")
    .single();
  if (error) return { error: `No pude dejar la propuesta: ${error.message}` };
  return { vista: { id: data.id, kind: "enviar_contratos", status: "propuesta", ...preview, resultado: null } };
}

const enviarContratos: Accion<ParamsContratos> = {
  async ejecutar({ departure_id, registration_ids }) {
    const r = await enviarContratosMasivo(departure_id, registration_ids);
    if (!r.ok) return { ok: false, resumen: r.error, filas: [] };
    const partes = [`${r.enviados} enviado${r.enviados === 1 ? "" : "s"}`];
    if (r.fallidos) partes.push(`${r.fallidos} con error`);
    if (r.omitidos) partes.push(`${r.omitidos} omitido${r.omitidos === 1 ? "" : "s"}`);
    return {
      ok: r.fallidos === 0,
      resumen: partes.join(" · "),
      filas: r.filas.map((f) => ({ nombre: f.nombre, email: f.email, hara: f.detalle, ok: f.ok })),
    };
  },
};

// --- Registro ------------------------------------------------------------------------------

export const ACCIONES: Record<string, Accion<any>> = {
  enviar_contratos: enviarContratos,
};

/** Fila de `assistant_actions` → lo que pinta la tarjeta. */
export function vistaDeFila(f: {
  id: string;
  kind: string;
  status: VistaAccion["status"];
  preview: Preview;
  result: VistaAccion["resultado"];
}): VistaAccion {
  return { id: f.id, kind: f.kind, status: f.status, ...f.preview, resultado: f.result ?? null };
}
