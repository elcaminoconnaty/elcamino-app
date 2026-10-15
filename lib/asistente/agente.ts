import "server-only";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGIN_LOCAL, MODELO, problemaDeConfiguracion } from "@/lib/asistente/config";
import { prepararEnvioContratos, type VistaAccion } from "@/lib/asistente/acciones";

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
 * de fábrica (nada de Bash, leer archivos ni navegar). Tiene dos clases de herramientas
 * propias, las dos con la sesión y el RLS de quien pregunta:
 *   - `consultar`: un SELECT de solo lectura (`asistente_consulta`).
 *   - `proponer_*`: dejan una acción PROPUESTA con la lista exacta de lo que pasaría. No
 *     ejecutan nada: la persona confirma con un botón en el chat (ver lib/asistente/acciones.ts).
 */

export type EventoAsistente =
  | { t: "texto"; d: string }
  | { t: "consulta"; sql: string }
  | { t: "accion"; accion: VistaAccion }
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
- Podés HACER algunas cosas, siempre en dos pasos: vos proponés con una herramienta \`proponer_*\` y la persona confirma tocando el botón de la tarjeta que aparece en el chat. **Nunca digas que algo se envió o se hizo**: queda propuesto hasta que confirme. Después de proponer, resumí en una o dos líneas qué va a pasar y quién se omite, y pedile que confirme con el botón.
- Lo que hoy podés proponer: **enviar o reenviar contratos a firmar** (\`proponer_envio_contratos\`). Primero consultá para identificar a las personas exactas y usá sus \`registrations.id\` del camino correcto. Si alguien no tiene correo o ya firmó, la propuesta lo marca como omitido; decilo.
- Cualquier otra cosa que cambie datos (registrar pagos, editar peregrinos, borrar), todavía no la podés hacer: explicá dónde se hace en la plataforma y poné el enlace.
- No narres lo que vas a consultar ("voy a revisar…"): consultá y respondé.
- Respondé en español colombiano, con voseo cercano, corto y al grano: primero la respuesta, después el detalle. Usá listas o tablas markdown cuando sean varias filas. Plata: euros como "1.234,56 €" y pesos como "$ 4.567.890 COP".
- Nunca muestres cédulas del equipo, tokens, códigos de verificación ni llaves. Datos personales de peregrinos (teléfono, pasaporte) solo si te los piden explícitamente.

${saber}

## Esquema (tablas y vistas de public)
${tablas}`;
}

// --- La consulta -------------------------------------------------------------------------

function servidorDeHerramientas(
  supabase: SupabaseClient,
  conversacionId: string,
  consultas: string[],
  avisar: (ev: EventoAsistente) => void
) {
  const consultar = tool(
    "consultar",
    "Corre UN SELECT (o WITH … SELECT) de solo lectura sobre la base de la plataforma y devuelve las filas en JSON (máximo 200). Sin punto y coma en el medio. Para agregados usá sum/count en la propia consulta.",
    { sql: z.string().describe("La consulta SELECT") },
    async ({ sql }) => {
      consultas.push(sql);
      avisar({ t: "consulta", sql });
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
  const proponerEnvioContratos = tool(
    "proponer_envio_contratos",
    "PROPONE enviar (o reenviar) el contrato a firmar a peregrinos de UN camino. No envía nada: deja una tarjeta con la lista exacta y un botón para que la persona confirme. Si el peregrino no tiene contrato, se genera; si ya tiene uno sin firmar, se le reenvía el enlace; si ya firmó o no tiene correo, se omite.",
    {
      departure_id: z.string().uuid().describe("departures.id del camino"),
      registration_ids: z.array(z.string().uuid()).min(1).max(40).describe("registrations.id de cada peregrino (no pilgrims.id)"),
    },
    async ({ departure_id, registration_ids }) => {
      const r = await prepararEnvioContratos(supabase, conversacionId, departure_id, registration_ids);
      if ("error" in r) return { content: [{ type: "text" as const, text: r.error }], isError: true };
      avisar({ t: "accion", accion: r.vista });
      const v = r.vista;
      const lineas = v.filas.map((f) => `- ${f.nombre}${f.email ? ` <${f.email}>` : ""}: ${f.hara}`).join("\n");
      return {
        content: [{
          type: "text" as const,
          text: `PROPUESTO, NO ENVIADO. La persona ve una tarjeta con el botón "${v.boton}".\n${v.detalle}\n${lineas}`,
        }],
      };
    }
  );

  return createSdkMcpServer({ name: "plataforma", version: "1.0.0", tools: [consultar, proponerEnvioContratos] });
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
  conversacionId: string;
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
        mcpServers: { plataforma: servidorDeHerramientas(opts.supabase, opts.conversacionId, consultas, (ev) => pendientes.push(ev)) },
        allowedTools: ["mcp__plataforma__consultar", "mcp__plataforma__proponer_envio_contratos"],
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
