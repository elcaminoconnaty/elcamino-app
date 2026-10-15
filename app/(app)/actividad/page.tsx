import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Quién hizo qué. Dos listas: los cambios en la base (`audit_log`, que llena un trigger en
 * cada tabla del negocio) y las preguntas al asistente (`assistant_messages`). Empezó el
 * 15-oct-2026, cuando cada quien pasó a entrar con su cédula; antes todo se hacía con una
 * cuenta compartida y no hay autor.
 */

const TABLAS: Record<string, string> = {
  pilgrims: "peregrino", registrations: "inscripción", pilgrim_payments: "pago de peregrino",
  payment_plan_installments: "cuota", departures: "camino", contracts: "contrato",
  providers: "proveedor", provider_payments: "pago a proveedor", provider_payment_accounts: "cuenta de proveedor",
  provider_photos: "foto de proveedor", reservations: "reserva", reservation_rooms: "habitaciones de reserva",
  reservation_payment_schedule: "cuota de reserva", room_assignments: "asignación de habitación",
  reservation_opt_outs: "\"no duerme / no cena\"", reservation_menu_courses: "sección de menú",
  reservation_menu_options: "plato de menú", meal_choices: "elección de menú", budget_items: "ítem de presupuesto",
  expenses: "gasto", trm_rates: "TRM", routes: "ruta", route_stages: "etapa de ruta",
  route_template_items: "plantilla de ruta", registration_requests: "solicitud de inscripción",
  pilgrim_videos: "video", app_settings: "configuración", profiles: "cuenta del equipo",
};
const VERBO: Record<string, string> = { insert: "creó", update: "editó", delete: "borró" };
const CAMPOS_NOMBRE = ["full_name", "name", "description", "label", "location", "concept", "accion"];

type Fila = {
  id: number; at: string; user_id: string | null; user_name: string | null; actor: string;
  table_name: string; op: string; row_id: string | null; changed: string[] | null;
  old: Record<string, unknown> | null; new: Record<string, unknown> | null;
};

function detalle(f: Fila, nombres: Map<string, string>): string {
  const datos = { ...(f.old ?? {}), ...(f.new ?? {}) };
  const partes: string[] = [];
  const nombre = CAMPOS_NOMBRE.map((k) => datos[k]).find((v) => typeof v === "string" && v);
  if (nombre) partes.push(String(nombre));
  else if (f.row_id && nombres.has(f.row_id)) partes.push(nombres.get(f.row_id)!);
  const ref = (datos.registration_id ?? datos.pilgrim_id ?? datos.departure_id ?? datos.provider_id) as string | undefined;
  if (ref && nombres.has(ref)) partes.push(nombres.get(ref)!);
  if (datos.amount != null) partes.push(`${Number(datos.amount).toLocaleString("es-CO")} ${datos.currency ?? ""}`.trim());
  if (f.op === "update" && f.changed?.length) partes.push(`cambió: ${f.changed.join(", ")}`);
  return partes.join(" · ");
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

export default async function ActividadPage({ searchParams }: { searchParams: { ver?: string; quien?: string } }) {
  const ver = searchParams.ver === "preguntas" ? "preguntas" : "cambios";
  const quien = searchParams.quien ?? null;
  const supabase = createClient();

  const { data: equipo } = await supabase.from("profiles").select("id, full_name, email").not("app_role", "is", null).order("full_name");
  const nombreDe = new Map((equipo ?? []).map((p) => [p.id, p.full_name ?? p.email ?? "—"]));

  const enlace = (cambios: Partial<{ ver: string; quien: string | null }>) => {
    const q = new URLSearchParams();
    const v = cambios.ver ?? ver;
    const w = "quien" in cambios ? cambios.quien : quien;
    if (v !== "cambios") q.set("ver", v);
    if (w) q.set("quien", w);
    const s = q.toString();
    return s ? `/actividad?${s}` : "/actividad";
  };

  let contenido: React.ReactNode;

  if (ver === "cambios") {
    let consulta = supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(150);
    if (quien) consulta = consulta.eq("user_id", quien);
    const { data } = await consulta;
    const filas = (data ?? []) as Fila[];

    // Nombres de las cosas que se mencionan (peregrinos, caminos, proveedores, inscripciones).
    const ids = new Set<string>();
    for (const f of filas) {
      const d = { ...(f.old ?? {}), ...(f.new ?? {}) } as Record<string, unknown>;
      for (const k of ["registration_id", "pilgrim_id", "departure_id", "provider_id"]) if (typeof d[k] === "string") ids.add(d[k] as string);
      if (f.row_id) ids.add(f.row_id);
    }
    const lista = Array.from(ids).filter((x) => /^[0-9a-f-]{36}$/.test(x));
    const nombres = new Map<string, string>();
    if (lista.length) {
      const [pe, ca, pr, re] = await Promise.all([
        supabase.from("pilgrims").select("id, full_name").in("id", lista),
        supabase.from("departures").select("id, name").in("id", lista),
        supabase.from("providers").select("id, name").in("id", lista),
        supabase.from("registrations").select("id, pilgrims:pilgrim_id(full_name)").in("id", lista),
      ]);
      for (const x of pe.data ?? []) nombres.set(x.id, x.full_name);
      for (const x of ca.data ?? []) nombres.set(x.id, x.name);
      for (const x of pr.data ?? []) nombres.set(x.id, x.name);
      for (const x of (re.data ?? []) as any[]) if (x.pilgrims?.full_name) nombres.set(x.id, x.pilgrims.full_name);
    }

    contenido = filas.length === 0 ? (
      <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay cambios registrados.</p>
    ) : (
      <ul className="divide-y">
        {filas.map((f) => (
          <li key={f.id} className="py-3 flex gap-3">
            <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", f.op === "delete" ? "bg-error-500" : f.op === "insert" ? "bg-ok-500" : "bg-info-500")} />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <span className="font-medium">{f.user_name ?? (f.actor === "sistema" ? "Sistema / enlace público" : "—")}</span>{" "}
                {VERBO[f.op] ?? f.op} {TABLAS[f.table_name] ?? f.table_name}
              </div>
              <div className="text-xs text-muted-foreground break-words">{detalle(f, nombres)}</div>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">{hora(f.at)}</div>
          </li>
        ))}
      </ul>
    );
  } else {
    let consulta = supabase
      .from("assistant_messages")
      .select("id, conversation_id, user_id, content, created_at")
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(150);
    if (quien) consulta = consulta.eq("user_id", quien);
    const { data } = await consulta;
    contenido = !data?.length ? (
      <p className="py-8 text-center text-sm text-muted-foreground">Nadie le ha preguntado nada al asistente todavía.</p>
    ) : (
      <ul className="divide-y">
        {data.map((m) => (
          <li key={m.id} className="py-3 flex gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">{nombreDe.get(m.user_id) ?? "—"} preguntó</div>
              <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">{hora(m.created_at)}</div>
          </li>
        ))}
      </ul>
    );
  }

  const chip = (activo: boolean) =>
    cn("h-9 px-3 rounded-full border text-sm inline-flex items-center", activo ? "bg-atlantico text-alba border-atlantico" : "bg-background hover:bg-piedra-suave");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-noche">Actividad</h1>
        <div className="brand-yellow-bar mt-2" />
        <p className="text-sm text-muted-foreground mt-2">
          Quién registró, cambió o borró qué, y quién le preguntó qué al asistente. Desde el 15 de octubre de 2026.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={enlace({ ver: "cambios" })} className={chip(ver === "cambios")}>Cambios</Link>
        <Link href={enlace({ ver: "preguntas" })} className={chip(ver === "preguntas")}>Preguntas al asistente</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={enlace({ quien: null })} className={chip(!quien)}>Todos</Link>
        {(equipo ?? []).map((p) => (
          <Link key={p.id} href={enlace({ quien: p.id })} className={chip(quien === p.id)}>
            {p.full_name ?? p.email}
          </Link>
        ))}
      </div>
      <Card>
        <CardContent className="pt-2">{contenido}</CardContent>
      </Card>
    </div>
  );
}
