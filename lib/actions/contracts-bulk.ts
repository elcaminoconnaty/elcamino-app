"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generarContrato, enviarContratoAFirmar, revisarContrato } from "@/lib/actions/contracts";
import { problemaDeConfiguracion } from "@/lib/email/send";

/**
 * Emitir y mandar a firmar los contratos de un camino, de una sola pasada.
 *
 * Hasta ahora había que abrir la tarjeta de cada peregrino y darle a "Generar" y luego a
 * "Enviar": trece veces para un camino de trece. Acá va lo mismo en dos pasos, y son dos
 * a propósito:
 *
 *   1. `previsualizarEnvioMasivo` dice, sin mandar nada, quién recibiría correo, quién no
 *      y por qué. Manda correos a personas reales: nadie debería darle a un botón sin ver
 *      antes la lista exacta.
 *   2. `enviarContratosMasivo` ejecuta **solo** sobre los ids que le pasen. No recalcula
 *      "todos los del camino", porque entre la vista previa y el clic pudo entrar alguien
 *      nuevo y nadie habría visto su nombre en la confirmación.
 *
 * Nunca corta en el primero que falla: un correo rebotado no puede dejar sin contrato a
 * los otros doce. Devuelve el resultado peregrino por peregrino.
 */

export type AccionMasiva = "generar_y_enviar" | "reenviar" | "omitir";

export type FilaPrevisualizacion = {
  registrationId: string;
  pilgrimId: string;
  contractId: string | null;
  nombre: string;
  email: string | null;
  accion: AccionMasiva;
  /** Por qué se omite, o qué se le va a hacer. Se muestra tal cual en la confirmación. */
  motivo: string;
};

export type ResultadoFila = {
  registrationId: string;
  nombre: string;
  email: string | null;
  ok: boolean;
  detalle: string;
};

/** Los inscritos que pueden tener contrato: sin el equipo, sin cancelados, sin borrados. */
async function inscripcionesDelCamino(supabase: any, departureId: string) {
  const { data } = await supabase
    .from("registrations")
    .select("id, status, pilgrim_id, pilgrims:pilgrim_id ( full_name, email, is_team, deleted_at )")
    .eq("departure_id", departureId);

  return (data ?? [])
    .filter((r: any) => r.pilgrims && !r.pilgrims.is_team && !r.pilgrims.deleted_at)
    .filter((r: any) => r.status !== "cancelado")
    .sort((a: any, b: any) =>
      String(a.pilgrims.full_name).localeCompare(String(b.pilgrims.full_name), "es")
    );
}

export async function previsualizarEnvioMasivo(departureId: string): Promise<FilaPrevisualizacion[]> {
  const supabase = createClient();
  const inscripciones = await inscripcionesDelCamino(supabase, departureId);
  const ids = inscripciones.map((r: any) => r.id);
  if (ids.length === 0) return [];

  const { data: contratos } = await supabase
    .from("contracts")
    .select("id, registration_id, status, version")
    .in("registration_id", ids)
    .in("status", ["borrador", "enviado", "visto", "firmado"]);

  const porInscripcion = new Map<string, any>((contratos ?? []).map((c: any) => [c.registration_id, c]));

  const filas = await Promise.all(
    inscripciones.map(async (r: any): Promise<FilaPrevisualizacion> => {
      const base = {
        registrationId: r.id,
        pilgrimId: r.pilgrim_id,
        nombre: r.pilgrims.full_name as string,
        email: (r.pilgrims.email as string) ?? null,
      };
      const c = porInscripcion.get(r.id);

      if (c?.status === "firmado") {
        return { ...base, contractId: c.id, accion: "omitir", motivo: "Ya firmó" };
      }
      if (!base.email) {
        return { ...base, contractId: c?.id ?? null, accion: "omitir", motivo: "No tiene correo cargado" };
      }
      if (c) {
        const cuando = c.status === "borrador" ? "sin enviar" : `ya enviado (${c.status})`;
        return {
          ...base,
          contractId: c.id,
          accion: "reenviar",
          motivo: `Contrato v${c.version} ${cuando} — se le manda el enlace de firma`,
        };
      }

      // Sin contrato: solo se puede emitir si no le falta ningún dato.
      try {
        const revision = await revisarContrato(r.id);
        if (revision.pendientes.length > 0) {
          return {
            ...base,
            contractId: null,
            accion: "omitir",
            motivo: `Falta ${revision.pendientes.map((p: any) => p.que_falta).join("; ")}`,
          };
        }
      } catch (e: any) {
        return {
          ...base,
          contractId: null,
          accion: "omitir",
          motivo: `No pude revisar sus datos: ${e?.message ?? "error desconocido"}`,
        };
      }
      return { ...base, contractId: null, accion: "generar_y_enviar", motivo: "Se genera el contrato y se envía" };
    })
  );

  return filas;
}

/**
 * Ejecuta el envío sobre las inscripciones indicadas. Vuelve a decidir la acción de cada
 * una en el momento (la vista previa pudo quedar vieja), pero nunca sale de la lista que
 * le pasaron.
 */
export async function enviarContratosMasivo(
  departureId: string,
  registrationIds: string[]
): Promise<{ enviados: number; fallidos: number; omitidos: number; filas: ResultadoFila[] }> {
  if (registrationIds.length === 0) {
    return { enviados: 0, fallidos: 0, omitidos: 0, filas: [] };
  }

  // Si falta la clave de Brevo, se sabe antes de generar un solo contrato: si no, quedarían
  // trece contratos emitidos sin que saliera ningún correo.
  const problema = await problemaDeConfiguracion();
  if (problema) throw new Error(problema);

  const previa = await previsualizarEnvioMasivo(departureId);
  const seleccionadas = new Set(registrationIds);
  const filas: ResultadoFila[] = [];

  for (const p of previa) {
    if (!seleccionadas.has(p.registrationId)) continue;

    if (p.accion === "omitir") {
      filas.push({ ...idFila(p), ok: false, detalle: `Omitido: ${p.motivo}` });
      continue;
    }

    try {
      let contractId = p.contractId;
      if (p.accion === "generar_y_enviar") {
        const creado = await generarContrato(p.registrationId, p.pilgrimId);
        contractId = creado.contractId;
      }
      if (!contractId) throw new Error("No quedó ningún contrato que enviar.");
      await enviarContratoAFirmar(contractId, p.pilgrimId);
      filas.push({
        ...idFila(p),
        ok: true,
        detalle: p.accion === "generar_y_enviar" ? "Contrato generado y enviado" : "Enlace de firma reenviado",
      });
    } catch (e: any) {
      // Se sigue con el resto: un correo rebotado no puede dejar sin contrato a los demás.
      filas.push({ ...idFila(p), ok: false, detalle: e?.message ?? "Error desconocido" });
    }
  }

  revalidatePath(`/caminos/${departureId}`);

  return {
    enviados: filas.filter((f) => f.ok).length,
    fallidos: filas.filter((f) => !f.ok && !f.detalle.startsWith("Omitido")).length,
    omitidos: filas.filter((f) => f.detalle.startsWith("Omitido")).length,
    filas,
  };
}

function idFila(p: FilaPrevisualizacion) {
  return { registrationId: p.registrationId, nombre: p.nombre, email: p.email };
}
