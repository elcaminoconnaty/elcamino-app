import "server-only";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGIN_LOCAL, MODELO, problemaDeConfiguracion } from "@/lib/asistente/config";

export { MODELO };

/**
 * El asistente de la plataforma.
 *
 * Corre con el **Claude Agent SDK** autenticado con la suscripción de Naty: un token de un año
 * que se saca con `claude setup-token` en su cuenta y va en Railway como
 * `CLAUDE_CODE_OAUTH_TOKEN`. No usa la consola de Anthropic ni cobra por API. Por eso, al
 * armar el entorno del proceso, se quitan `ANTHROPIC_API_KEY` y `ANTHROPIC_AUTH_TOKEN`: si
 * estuvieran, le ganarían al token (la de la importación de reservas sí existe en Railway).
 *
 * El SDK levanta un proceso de Claude Code por pregunta. Se le quitan TODAS las herramientas
 * de fábrica (nada de Bash, leer archivos ni navegar): la única que tiene es `consultar`, un
 * SELECT de solo lectura que corre con la sesión de quien pregunta, con su RLS (ver
 * `asistente_consulta` en scripts/sql/20261015_equipo_actividad_asistente.sql).
 */

export type EventoAsistente =
  | { t: "texto"; d: string }
  | { t: "consulta"; sql: string }
  | { t: "fin"; texto: string; consultas: string[]; modelo: string | null; ms: number }
  | { t: "error"; mensaje: string };

const MAX_RESULTADO = 40_000;

function entornoDelAgente(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k === "ANTHROPIC_API_KEY" || k === "ANTHROPIC_AUTH_TOKEN") continue;
    // Las llaves de la plataforma no tienen nada que hacer en el proceso del agente.
    if (k === "SUPABASE_SERVICE_ROLE_KEY" || k.startsWith("BREVO_") || k.startsWith("N8N_") || k.startsWith("R2_") || k.startsWith("AWS_")) continue;
    env[k] = v;
  }
  if (!LOGIN_LOCAL) env.CLAUDE_CONFIG_DIR = path.join(tmpdir(), "asistente-claude");
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
  env.DISABLE_TELEMETRY = "1";
  return env;
}

// --- Conocimiento --------------------------------------------------------------------------

let conocimiento: Promise<string> | null = null;
function leerConocimiento() {
  conocimiento ??= Promise.all(
    ["conocimiento-negocio.md", "conocimiento-plataforma.md"].map((f) =>
      readFile(path.join(process.cwd(), "lib/asistente", f), "utf8").catch(() => "")
    )
  ).then((partes) => partes.join("\n\n---\n\n"));
  return conocimiento;
}

let esquema: { texto: string; hasta: number } | null = null;
/** Tablas y vistas con sus columnas, leídas de la base (10 min de caché por proceso). */
async function leerEsquema(supabase: SupabaseClient): Promise<string> {
  if (esquema && esquema.hasta > Date.now()) return esquema.texto;
  const { data, error } = await supabase.rpc(
    "asistente_consulta",
    {
      q: `select c.table_name as t, string_agg(c.column_name || ' ' || c.data_type, ', ' order by c.ordinal_position) as cols
          from information_schema.columns c
          where c.table_schema = 'public' and c.table_name not in ('contract_otps', 'email_templates')
          group by c.table_name order by c.table_name`,
    },
    { get: true }
  );
  if (error || !Array.isArray(data)) return esquema?.texto ?? "(no pude leer el esquema; usá information_schema.columns)";
  const texto = (data as { t: string; cols: string }[]).map((r) => `- ${r.t}(${r.cols})`).join("\n");
  esquema = { texto, hasta: Date.now() + 10 * 60_000 };
  return texto;
}

function hoyEnBogota() {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

async function instrucciones(supabase: SupabaseClient, quien: string) {
  const [saber, tablas] = await Promise.all([leerConocimiento(), leerEsquema(supabase)]);
  return `Sos el asistente interno de la plataforma de El Camino con Naty. Le respondés a ${quien}, del equipo (Naty y Nico son los dueños). Hoy es ${hoyEnBogota()} (hora de Colombia).

Cómo trabajás:
- Para cualquier dato de peregrinos, pagos, contratos, reservas, proveedores o plata, consultá la base con la herramienta \`consultar\`. Nunca inventes cifras ni nombres: si no está en la base ni en el conocimiento de abajo, decí que no lo sabés.
- Podés hacer varias consultas seguidas. Si una falla, leé el error, corregí y reintentá. Si una pregunta es ambigua (dos peregrinas con el mismo nombre, dos caminos en abril), decilo y mostrá las opciones.
- Solo podés LEER. Si te piden registrar, cambiar o borrar algo, explicá dónde se hace en la plataforma y poné el enlace.
- No narres lo que vas a consultar ("voy a revisar…"): consultá y respondé.
- Respondé en español colombiano, con voseo cercano, corto y al grano: primero la respuesta, después el detalle. Usá listas o tablas markdown cuando sean varias filas. Plata: euros como "1.234,56 €" y pesos como "$ 4.567.890 COP".
- Nunca muestres cédulas del equipo, tokens, códigos de verificación ni llaves. Datos personales de peregrinos (teléfono, pasaporte) solo si te los piden explícitamente.

${saber}

## Esquema (tablas y vistas de public)
${tablas}`;
}

// --- La consulta -------------------------------------------------------------------------

function servidorDeHerramientas(supabase: SupabaseClient, consultas: string[], avisar: (sql: string) => void) {
  const consultar = tool(
    "consultar",
    "Corre UN SELECT (o WITH … SELECT) de solo lectura sobre la base de la plataforma y devuelve las filas en JSON (máximo 200). Sin punto y coma en el medio. Para agregados usá sum/count en la propia consulta.",
    { sql: z.string().describe("La consulta SELECT") },
    async ({ sql }) => {
      consultas.push(sql);
      avisar(sql);
      // GET: PostgREST corre los GET en una transacción de solo lectura, y la función lo exige.
      const { data, error } = await supabase.rpc("asistente_consulta", { q: sql }, { get: true });
      if (error) {
        return { content: [{ type: "text" as const, text: `Error de la base: ${error.message}${error.hint ? ` (pista: ${error.hint})` : ""}` }], isError: true };
      }
      const filas = Array.isArray(data) ? data.length : 0;
      let texto = JSON.stringify(data);
      if (texto.length > MAX_RESULTADO) {
        texto = texto.slice(0, MAX_RESULTADO) + `… [recortado: ${filas} filas; pedí menos columnas o agregá]`;
      }
      return { content: [{ type: "text" as const, text: `${filas} filas${filas === 200 ? " (límite: puede haber más)" : ""}\n${texto}` }] };
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true }
  );
  return createSdkMcpServer({ name: "plataforma", version: "1.0.0", tools: [consultar] });
}

export type Turno = { role: "user" | "assistant"; content: string };

/**
 * Corre una pregunta y va emitiendo eventos (texto en vivo, consultas, fin o error).
 * `historial` son los turnos anteriores de la conversación: el proceso del SDK no guarda
 * sesiones (en Railway el disco se borra en cada despliegue), así que el contexto se le
 * pasa en el propio mensaje.
 */
export async function* preguntar(opts: {
  supabase: SupabaseClient;
  quien: string;
  pregunta: string;
  historial: Turno[];
  signal?: AbortSignal;
}): AsyncGenerator<EventoAsistente> {
  const inicio = Date.now();
  const falta = problemaDeConfiguracion();
  if (falta) {
    yield { t: "error", mensaje: falta };
    return;
  }

  const consultas: string[] = [];
  const pendientes: EventoAsistente[] = [];
  const controller = new AbortController();
  opts.signal?.addEventListener("abort", () => controller.abort());

  const cwd = path.join(tmpdir(), "asistente-cwd");
  await mkdir(cwd, { recursive: true });

  const contexto = opts.historial.length
    ? `Conversación hasta ahora:\n${opts.historial
        .map((t) => `${t.role === "user" ? "PREGUNTA" : "RESPUESTA"}: ${t.content}`)
        .join("\n\n")}\n\n---\nNueva pregunta: `
    : "";

  let texto = "";
  let modelo: string | null = null;
  let huboHerramienta = false;

  try {
    const q = query({
      prompt: contexto + opts.pregunta,
      options: {
        systemPrompt: await instrucciones(opts.supabase, opts.quien),
        model: MODELO,
        maxTurns: 14,
        tools: [],
        mcpServers: { plataforma: servidorDeHerramientas(opts.supabase, consultas, (sql) => pendientes.push({ t: "consulta", sql })) },
        allowedTools: ["mcp__plataforma__consultar"],
        permissionMode: "dontAsk",
        settingSources: [],
        includePartialMessages: true,
        persistSession: false,
        cwd,
        env: entornoDelAgente(),
        abortController: controller,
      },
    });

    for await (const m of q) {
      while (pendientes.length) yield pendientes.shift()!;

      if (m.type === "system" && m.subtype === "init") {
        modelo = m.model ?? null;
      } else if (m.type === "stream_event") {
        const ev = m.event;
        if (ev.type === "content_block_start" && ev.content_block.type === "text" && huboHerramienta && texto) {
          // Texto nuevo después de consultar: que no quede pegado al anterior.
          texto += "\n\n";
          yield { t: "texto", d: "\n\n" };
          huboHerramienta = false;
        } else if (ev.type === "content_block_start" && ev.content_block.type !== "text") {
          huboHerramienta = true;
        } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          texto += ev.delta.text;
          yield { t: "texto", d: ev.delta.text };
        }
      } else if (m.type === "result") {
        while (pendientes.length) yield pendientes.shift()!;
        if (m.subtype !== "success") {
          const motivo =
            m.subtype === "error_max_turns"
              ? "La pregunta necesitó demasiados pasos. Probá partirla en preguntas más concretas."
              : `El asistente no pudo terminar (${m.subtype}).`;
          yield { t: "error", mensaje: motivo };
          return;
        }
        if (m.is_error) {
          // Así llegan los fallos de autenticación y de cupo: como un "resultado" con is_error.
          yield { t: "error", mensaje: traducirError(m.result ?? "") };
          return;
        }
        if (!texto && m.result) {
          texto = m.result;
          yield { t: "texto", d: m.result };
        }
      }
    }
    yield { t: "fin", texto, consultas, modelo, ms: Date.now() - inicio };
  } catch (e) {
    if (controller.signal.aborted) return;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistente]", msg);
    yield { t: "error", mensaje: traducirError(msg) };
  }
}

function traducirError(msg: string): string {
  if (/auth|401|oauth|token|credential|log ?in/i.test(msg)) {
    return "La suscripción de Claude de Naty no respondió (token vencido o inválido). Hay que generar uno nuevo con `claude setup-token` y actualizarlo en Railway.";
  }
  if (/rate|limit|429|usage|quota/i.test(msg)) return "Se agotó por ahora el cupo de la suscripción de Claude. Probá en un rato.";
  return `El asistente falló: ${msg.slice(0, 300)}`;
}
