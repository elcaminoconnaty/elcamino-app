"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Check, Database, History, Plus, Send, Sparkles, X } from "lucide-react";
import type { VistaAccion } from "@/lib/asistente/acciones";
import { cn } from "@/lib/utils";

export type Mensaje = {
  id: string;
  role: "user" | "assistant";
  content: string;
  consultas: string[];
  acciones?: VistaAccion[];
  error?: string | null;
  enCurso?: boolean;
};

type Conversacion = { id: string; titulo: string; fecha: string };

const SUGERENCIAS = [
  "¿Quién falta por firmar el contrato de abril?",
  "¿Cuánto le falta pagar a cada peregrino de abril?",
  "¿Qué pagos a proveedores vencen en los próximos 30 días?",
  "¿Cómo va la plata del camino de abril?",
  "¿Qué se registró hoy en la plataforma y quién lo hizo?",
];

/**
 * El chat del asistente. Lee la respuesta en vivo de `/api/asistente` (NDJSON) y la va
 * pintando. El scroll es el de la página, no uno interno: en el iPhone, con el teclado
 * abierto, un contenedor con scroll propio se queda trabado detrás del teclado.
 */
export function Chat({
  conversacionId,
  mensajesIniciales,
  conversaciones,
  aviso,
}: {
  conversacionId: string | null;
  mensajesIniciales: Mensaje[];
  conversaciones: Conversacion[];
  aviso: string | null;
}) {
  const router = useRouter();
  const [mensajes, setMensajes] = React.useState<Mensaje[]>(mensajesIniciales);
  const [texto, setTexto] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);
  const [verHistorial, setVerHistorial] = React.useState(false);
  const conv = React.useRef<string | null>(conversacionId);
  const final = React.useRef<HTMLDivElement>(null);
  const campo = React.useRef<HTMLTextAreaElement>(null);

  const alFinal = React.useCallback(() => {
    final.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, []);
  React.useEffect(() => {
    if (mensajes.length) alFinal();
  }, [mensajes, alFinal]);

  // El campo crece con el texto, hasta ~6 renglones.
  React.useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);

  async function enviar(pregunta: string) {
    pregunta = pregunta.trim();
    if (!pregunta || ocupado) return;
    setTexto("");
    setOcupado(true);
    const idRespuesta = `r-${Date.now()}`;
    setMensajes((m) => [
      ...m,
      { id: `p-${Date.now()}`, role: "user", content: pregunta, consultas: [] },
      { id: idRespuesta, role: "assistant", content: "", consultas: [], enCurso: true },
    ]);
    const actualizar = (f: (m: Mensaje) => Mensaje) =>
      setMensajes((ms) => ms.map((m) => (m.id === idRespuesta ? f(m) : m)));

    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacionId: conv.current, pregunta }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `Error ${res.status}`);

      const lector = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lineas = buffer.split("\n");
        buffer = lineas.pop() ?? "";
        for (const linea of lineas) {
          if (!linea.trim()) continue;
          const ev = JSON.parse(linea);
          if (ev.t === "conversacion" && !conv.current) {
            conv.current = ev.id;
            // La URL queda con la conversación, sin recargar la página.
            window.history.replaceState(null, "", `/asistente?c=${ev.id}`);
          } else if (ev.t === "texto") actualizar((m) => ({ ...m, content: m.content + ev.d }));
          else if (ev.t === "consulta") actualizar((m) => ({ ...m, consultas: [...m.consultas, ev.sql] }));
          else if (ev.t === "accion") actualizar((m) => ({ ...m, acciones: [...(m.acciones ?? []), ev.accion] }));
          else if (ev.t === "error") actualizar((m) => ({ ...m, error: ev.mensaje }));
        }
      }
    } catch (e) {
      actualizar((m) => ({ ...m, error: e instanceof Error ? e.message : "No pude conectar con el asistente." }));
    } finally {
      actualizar((m) => ({ ...m, enCurso: false }));
      setOcupado(false);
      router.refresh(); // el historial de conversaciones
    }
  }

  function nueva() {
    conv.current = null;
    setMensajes([]);
    setVerHistorial(false);
    router.push("/asistente");
  }

  return (
    <div className="mx-auto max-w-3xl flex flex-col min-h-[calc(100dvh-10rem)] md:min-h-[calc(100dvh-8rem)]">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-5 w-5 text-ocre shrink-0" />
          <h1 className="font-display text-2xl text-noche truncate">Asistente</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setVerHistorial((v) => !v)}
            className="h-10 px-3 rounded-md hover:bg-piedra-suave flex items-center gap-1.5 text-sm text-atlantico"
            aria-expanded={verHistorial}
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Conversaciones</span>
          </button>
          <button onClick={nueva} className="h-10 px-3 rounded-md hover:bg-piedra-suave flex items-center gap-1.5 text-sm text-atlantico">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nueva</span>
          </button>
        </div>
      </div>

      {verHistorial && (
        <div className="mb-4 rounded-lg border bg-background">
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <span className="text-sm font-medium">Tus conversaciones</span>
            <button onClick={() => setVerHistorial(false)} className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-piedra-suave" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          {conversaciones.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Todavía no hay ninguna.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y">
              {conversaciones.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/asistente?c=${c.id}`}
                    onClick={() => setVerHistorial(false)}
                    className={cn("block px-4 py-3 text-sm hover:bg-piedra-suave", c.id === conv.current && "bg-piedra-suave")}
                  >
                    <div className="truncate">{c.titulo}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(c.fecha).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aviso && (
        <div className="mb-4 rounded-lg border border-aviso-300 bg-aviso-50 px-4 py-3 text-sm text-aviso-900">{aviso}</div>
      )}

      <div className="flex-1 space-y-5 pb-4">
        {mensajes.length === 0 ? (
          <div className="pt-6">
            <p className="text-muted-foreground mb-4">
              Preguntame lo que necesités de los caminos, los peregrinos, los contratos, los pagos o los proveedores.
              Leo la plataforma en vivo. Si me pedís mandar contratos, te muestro la lista exacta y vos confirmás con un botón.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  disabled={ocupado || !!aviso}
                  className="text-left text-sm rounded-xl border bg-background px-4 py-3 hover:bg-piedra-suave disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          mensajes.map((m) => <Burbuja key={m.id} m={m} />)
        )}
        <div ref={final} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 z-20 mt-2"
      >
        <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm">
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía en computador; en el celular el Enter es salto de línea.
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                enviar(texto);
              }
            }}
            rows={1}
            placeholder="Escribí tu pregunta…"
            className="flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
            disabled={!!aviso}
          />
          <button
            type="submit"
            disabled={ocupado || !texto.trim() || !!aviso}
            className="h-10 w-10 shrink-0 rounded-full bg-ocre-profundo text-alba flex items-center justify-center disabled:opacity-40"
            aria-label="Enviar"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Burbuja({ m }: { m: Mensaje }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-atlantico text-alba px-4 py-2.5 whitespace-pre-wrap text-[15px]">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {m.consultas.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer inline-flex items-center gap-1.5 select-none">
            <Database className="h-3.5 w-3.5" />
            {m.enCurso && !m.content ? "Consultando la plataforma…" : `${m.consultas.length} consulta${m.consultas.length === 1 ? "" : "s"} a la plataforma`}
          </summary>
          <div className="mt-2 space-y-2">
            {m.consultas.map((sql, i) => (
              <pre key={i} className="overflow-x-auto rounded-md bg-piedra-suave p-2 text-[11px] leading-snug">{sql}</pre>
            ))}
          </div>
        </details>
      )}
      {m.content ? (
        <div className="prose-asistente text-[15px] leading-relaxed text-noche">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) =>
                href?.startsWith("/") ? (
                  <Link href={href} className="text-ocre-profundo underline underline-offset-2">{children}</Link>
                ) : (
                  <a href={href} target="_blank" rel="noreferrer" className="text-ocre-profundo underline underline-offset-2">{children}</a>
                ),
              table: ({ children }) => (
                <div className="my-3 overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">{children}</table>
                </div>
              ),
            }}
          >
            {m.content}
          </ReactMarkdown>
        </div>
      ) : m.enCurso && m.consultas.length === 0 ? (
        <div className="flex gap-1 py-2" aria-label="Pensando">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 rounded-full bg-niebla animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      ) : null}
      {(m.acciones ?? []).map((a) => (
        <TarjetaAccion key={a.id} inicial={a} />
      ))}
      {m.error && (
        <div className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-800">{m.error}</div>
      )}
    </div>
  );
}

/**
 * Lo que el asistente propone hacer, con la lista exacta y el botón. Nada pasa hasta que la
 * persona toca Confirmar; el servidor ejecuta exactamente esta lista (ver lib/asistente/acciones.ts).
 */
function TarjetaAccion({ inicial }: { inicial: VistaAccion }) {
  const router = useRouter();
  const [a, setA] = React.useState(inicial);
  const [enviando, setEnviando] = React.useState<"confirmar" | "cancelar" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function decidir(decision: "confirmar" | "cancelar") {
    setEnviando(decision);
    setError(null);
    try {
      const res = await fetch(`/api/asistente/acciones/${a.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.accion) setA(data.accion);
      if (!res.ok && data.error) setError(data.error);
      router.refresh();
    } catch {
      setError("No pude conectar. Revisá la conexión y volvé a intentar.");
    } finally {
      setEnviando(null);
    }
  }

  const filas = a.resultado?.filas.length ? a.resultado.filas : a.filas;
  const estado: Record<VistaAccion["status"], string> = {
    propuesta: "Esperando tu confirmación",
    ejecutando: "Ejecutando…",
    ejecutada: "Hecho",
    fallida: "Terminó con errores",
    cancelada: "Cancelada",
  };

  return (
    <div className={cn("rounded-xl border bg-background overflow-hidden", a.status === "propuesta" && "border-ocre")}>
      <div className="px-4 py-3 border-b bg-piedra-suave/60">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium text-sm text-noche">{a.titulo}</div>
          <span
            className={cn(
              "text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap",
              a.status === "propuesta" && "bg-aviso-100 text-aviso-900",
              a.status === "ejecutada" && "bg-ok-100 text-ok-900",
              a.status === "fallida" && "bg-error-100 text-error-900",
              (a.status === "cancelada" || a.status === "ejecutando") && "bg-muted text-muted-foreground"
            )}
          >
            {estado[a.status]}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{a.resultado?.resumen ?? a.detalle}</div>
      </div>
      <ul className="divide-y text-sm max-h-80 overflow-y-auto">
        {filas.map((f, i) => (
          <li key={i} className="px-4 py-2 flex gap-2">
            {f.ok ? <Check className="h-4 w-4 mt-0.5 shrink-0 text-ok-500" /> : <X className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <div className="truncate">{f.nombre}</div>
              <div className="text-xs text-muted-foreground break-words">
                {f.email ? `${f.email} · ` : ""}
                {f.hara}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {error && <div className="px-4 py-2 text-sm text-error-800 bg-error-50 border-t">{error}</div>}
      {a.status === "propuesta" && (
        <div className="px-4 py-3 border-t flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={() => decidir("cancelar")}
            disabled={!!enviando}
            className="h-11 sm:h-9 px-4 rounded-md border text-sm hover:bg-piedra-suave disabled:opacity-50"
          >
            {enviando === "cancelar" ? "Cancelando…" : "Cancelar"}
          </button>
          <button
            onClick={() => decidir("confirmar")}
            disabled={!!enviando || a.ejecutables === 0}
            className="h-11 sm:h-9 px-4 rounded-md bg-ocre-profundo text-alba text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {enviando === "confirmar" ? "Enviando…" : a.boton}
          </button>
        </div>
      )}
    </div>
  );
}
