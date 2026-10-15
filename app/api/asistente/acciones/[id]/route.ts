import { createClient } from "@/lib/supabase/server";
import { ACCIONES, vistaDeFila } from "@/lib/asistente/acciones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Una propuesta vieja no se ejecuta: la lista que vio la persona ya puede no ser la real. */
const VIGENCIA_MS = 24 * 60 * 60 * 1000;

/**
 * POST { decision: "confirmar" | "cancelar" } — la persona responde a una tarjeta del asistente.
 *
 * Solo la misma persona que pidió la acción puede confirmarla. El paso de 'propuesta' a
 * 'ejecutando' es atómico (update … where status = 'propuesta'), así que un doble toque o
 * dos pestañas no la corren dos veces. Lo que pasó se anota también como mensaje en la
 * conversación, para que el asistente lo sepa en la próxima pregunta.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const decision = body?.decision;
  if (decision !== "confirmar" && decision !== "cancelar") return Response.json({ error: "Decisión inválida" }, { status: 400 });

  const { data: fila } = await supabase.from("assistant_actions").select("*").eq("id", params.id).maybeSingle();
  if (!fila) return Response.json({ error: "No encontré esa propuesta." }, { status: 404 });
  if (fila.user_id !== user.id) return Response.json({ error: "Solo quien la pidió puede confirmarla." }, { status: 403 });
  if (fila.status !== "propuesta") return Response.json({ error: "Esta propuesta ya se respondió.", accion: vistaDeFila(fila) }, { status: 409 });

  const anotarEnConversacion = (texto: string) =>
    supabase.from("assistant_messages").insert({ conversation_id: fila.conversation_id, user_id: user.id, role: "assistant", content: texto });

  if (decision === "cancelar" || Date.now() - new Date(fila.created_at).getTime() > VIGENCIA_MS) {
    const vencida = decision === "confirmar";
    const { data: cancelada } = await supabase
      .from("assistant_actions")
      .update({ status: "cancelada", decided_at: new Date().toISOString(), result: vencida ? { resumen: "Vencida: pasaron más de 24 horas. Pedila de nuevo.", filas: [] } : null })
      .eq("id", fila.id)
      .eq("status", "propuesta")
      .select("*")
      .single();
    await anotarEnConversacion(vencida ? `(La propuesta "${fila.preview.titulo}" venció sin ejecutarse.)` : `(Cancelado: "${fila.preview.titulo}". No se hizo nada.)`);
    return Response.json({ accion: vistaDeFila(cancelada ?? fila) }, { status: vencida ? 410 : 200 });
  }

  const accion = ACCIONES[fila.kind];
  if (!accion) return Response.json({ error: `Acción desconocida: ${fila.kind}` }, { status: 400 });

  const { data: tomada } = await supabase
    .from("assistant_actions")
    .update({ status: "ejecutando", decided_at: new Date().toISOString() })
    .eq("id", fila.id)
    .eq("status", "propuesta")
    .select("id");
  if (!tomada?.length) return Response.json({ error: "Esta propuesta ya se respondió." }, { status: 409 });

  let resultado: { ok: boolean; resumen: string; filas: { nombre: string; email: string | null; hara: string; ok: boolean }[] };
  try {
    resultado = await accion.ejecutar(fila.params);
  } catch (e) {
    resultado = { ok: false, resumen: e instanceof Error ? e.message : "Error desconocido", filas: [] };
  }

  const { data: final } = await supabase
    .from("assistant_actions")
    .update({ status: resultado.ok ? "ejecutada" : "fallida", result: { resumen: resultado.resumen, filas: resultado.filas } })
    .eq("id", fila.id)
    .select("*")
    .single();

  await anotarEnConversacion(
    `Resultado de "${fila.preview.titulo}" (confirmado): ${resultado.resumen}.\n` +
      resultado.filas.map((f) => `- ${f.nombre}: ${f.hara}`).join("\n")
  );
  await supabase.from("assistant_conversations").update({ updated_at: new Date().toISOString() }).eq("id", fila.conversation_id);

  return Response.json({ accion: vistaDeFila(final ?? { ...fila, status: resultado.ok ? "ejecutada" : "fallida", result: resultado }) });
}
