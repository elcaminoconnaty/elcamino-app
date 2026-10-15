import { createClient } from "@/lib/supabase/server";
import { Chat, type Mensaje } from "@/components/asistente/chat";
import { problemaDeConfiguracion } from "@/lib/asistente/config";
import { vistaDeFila, type VistaAccion } from "@/lib/asistente/acciones";

export const dynamic = "force-dynamic";

export default async function AsistentePage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: conversaciones } = await supabase
    .from("assistant_conversations")
    .select("id, title, updated_at")
    .eq("user_id", user!.id)
    .order("updated_at", { ascending: false })
    .limit(30);

  let mensajes: Mensaje[] = [];
  const actual = searchParams.c && conversaciones?.some((c) => c.id === searchParams.c) ? searchParams.c : null;
  if (actual) {
    const { data } = await supabase
      .from("assistant_messages")
      .select("id, role, content, tools, error")
      .eq("conversation_id", actual)
      .order("created_at");
    const { data: filasAcciones } = await supabase
      .from("assistant_actions")
      .select("id, kind, status, preview, result, message_id")
      .eq("conversation_id", actual)
      .order("created_at");
    const porMensaje = new Map<string, VistaAccion[]>();
    for (const f of filasAcciones ?? []) {
      if (!f.message_id) continue;
      porMensaje.set(f.message_id, [...(porMensaje.get(f.message_id) ?? []), vistaDeFila(f as any)]);
    }
    mensajes = (data ?? []).map((m) => ({
      id: m.id,
      role: m.role as Mensaje["role"],
      content: m.content,
      consultas: (m.tools as string[] | null) ?? [],
      acciones: porMensaje.get(m.id) ?? [],
      error: m.error,
    }));
  }

  return (
    <Chat
      key={actual ?? "nueva"}
      conversacionId={actual}
      mensajesIniciales={mensajes}
      conversaciones={(conversaciones ?? []).map((c) => ({ id: c.id, titulo: c.title ?? "Sin título", fecha: c.updated_at }))}
      aviso={problemaDeConfiguracion()}
    />
  );
}
