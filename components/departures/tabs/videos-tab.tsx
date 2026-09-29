import { createClient } from "@/lib/supabase/server";
import { baseUrl } from "@/lib/url";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { destinatarioDe } from "@/lib/bienvenida/datos";
import { ListaVideos, type FilaVideo } from "@/components/departures/lista-videos";

/**
 * Los videos personalizados del camino (mensajes de la familia de cada peregrino). Cada uno
 * tiene su enlace privado /video/<token>; desde acá se mandan por WhatsApp, uno por uno,
 * y se ve quién ya lo abrió.
 *
 * Los videos se suben con `scripts/subir-videos.mjs` (pesan 100 MB o más: no pasan por el
 * formulario de la app).
 */
export async function VideosTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const { data: regs } = await supabase
    .from("registrations")
    .select("id, status, pilgrim_id, pilgrims:pilgrim_id(full_name, nickname, sex, phone, is_team, deleted_at)")
    .eq("departure_id", departureId)
    .neq("status", "cancelado");
  const inscritos = (regs ?? []).filter((r: any) => r.pilgrims && !r.pilgrims.is_team && !r.pilgrims.deleted_at);
  const { data: videos } = inscritos.length
    ? await supabase
        .from("pilgrim_videos")
        .select("id, registration_id, token, nombre, duration_s, sent_at, first_viewed_at, last_viewed_at, view_count")
        .in("registration_id", inscritos.map((r: any) => r.id))
    : { data: [] as any[] };
  const porReg = new Map((videos ?? []).map((v: any) => [v.registration_id, v]));
  const base = baseUrl();

  const filas: FilaVideo[] = inscritos
    .map((r: any) => {
      const v = porReg.get(r.id);
      return {
        registrationId: r.id,
        pilgrimId: r.pilgrim_id,
        nombreCompleto: r.pilgrims.full_name,
        nombre: v?.nombre?.trim() || destinatarioDe(r.pilgrims).nombre,
        telefono: r.pilgrims.phone,
        video: v
          ? {
              id: v.id,
              url: `${base}/video/${v.token}`,
              minutos: Math.max(1, Math.round(Number(v.duration_s ?? 60) / 60)),
              enviado: v.sent_at,
              primeraVista: v.first_viewed_at,
              ultimaVista: v.last_viewed_at,
              vistas: v.view_count ?? 0,
            }
          : null,
      };
    })
    .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es"));

  const conVideo = filas.filter((f) => f.video).length;
  const vistos = filas.filter((f) => f.video?.vistas).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Videos personalizados</CardTitle>
        <CardDescription>
          {conVideo === 0
            ? "Este camino todavía no tiene videos. Se suben con scripts/subir-videos.mjs."
            : `${conVideo} de ${filas.length} peregrinos tienen video · ${vistos} ya lo vieron. Cada enlace es privado: solo abre el video de esa persona.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ListaVideos filas={filas} />
      </CardContent>
    </Card>
  );
}
