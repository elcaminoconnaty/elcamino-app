import { createClient } from "@/lib/supabase/server";
import { preguntar, MODELO, type EventoAsistente, type Turno } from "@/lib/asistente/agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { conversacionId?, pregunta } → NDJSON en vivo: una línea por evento
 * (`{t:"conversacion"}` primero, luego `texto`, `consulta`, y al final `fin` o `error`).
 *
 * La pregunta y la respuesta se guardan con el autor (RLS: `user_id = auth.uid()`), así que
 * queda registro de quién preguntó qué.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("full_name, email, app_role").eq("id", user.id).maybeSingle();
  if (!perfil?.app_role) return new Response("No autorizado", { status: 403 });

  const body = await request.json().catch(() => null);
  const pregunta = String(body?.pregunta ?? "").trim().slice(0, 4000);
  if (!pregunta) return new Response("Falta la pregunta", { status: 400 });

  let conversacionId: string | null = body?.conversacionId ?? null;
  let historial: Turno[] = [];

  if (conversacionId) {
    const { data: conv } = await supabase.from("assistant_conversations").select("id, user_id").eq("id", conversacionId).maybeSingle();
    if (!conv || conv.user_id !== user.id) conversacionId = null; // se continúa solo una conversación propia
    else {
      const { data: previos } = await supabase
        .from("assistant_messages")
        .select("role, content")
        .eq("conversation_id", conversacionId)
        .order("created_at", { ascending: false })
        .limit(10);
      historial = ((previos ?? []) as Turno[]).reverse();
    }
  }
  if (!conversacionId) {
    const { data: nueva, error } = await supabase
      .from("assistant_conversations")
      .insert({ user_id: user.id, title: pregunta.slice(0, 80) })
      .select("id")
      .single();
    if (error) return new Response(`No pude abrir la conversación: ${error.message}`, { status: 500 });
    conversacionId = nueva.id;
  }

  await supabase.from("assistant_messages").insert({ conversation_id: conversacionId, user_id: user.id, role: "user", content: pregunta });

  const quien = perfil.full_name ?? perfil.email ?? "alguien del equipo";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enviar = (ev: EventoAsistente | { t: "conversacion"; id: string }) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        } catch {
          /* el cliente se fue; igual terminamos y guardamos */
        }
      };
      enviar({ t: "conversacion", id: conversacionId! });

      let texto = "";
      let consultas: string[] = [];
      let modelo: string | null = MODELO;
      let ms = 0;
      let error: string | null = null;
      const inicio = Date.now();

      // Sin `request.signal` a propósito: en el iPhone basta cambiar de app para cortar la
      // conexión, y la respuesta igual tiene que terminar y quedar guardada en la conversación.
      for await (const ev of preguntar({ supabase, quien, pregunta, historial })) {
        if (ev.t === "texto") texto += ev.d;
        if (ev.t === "consulta") consultas.push(ev.sql);
        if (ev.t === "fin") ({ texto, consultas, modelo, ms } = { ...ev, modelo: ev.modelo ?? MODELO });
        if (ev.t === "error") error = ev.mensaje;
        enviar(ev);
      }

      await supabase.from("assistant_messages").insert({
        conversation_id: conversacionId,
        user_id: user.id,
        role: "assistant",
        content: texto || (error ? `⚠️ ${error}` : "(sin respuesta)"),
        tools: consultas.length ? consultas : null,
        error,
        model: modelo,
        duration_ms: ms || Date.now() - inicio,
      });
      await supabase.from("assistant_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversacionId);
      try {
        controller.close();
      } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
