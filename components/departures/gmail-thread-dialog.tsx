"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { buscarHilosDeReserva, enlazarHilo, desenlazarHilo, type HiloDeReserva } from "@/lib/actions/gmail-thread";
import { ExternalLink, Link2, Link2Off, MailCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function fecha(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

/** "12 may 2026 → 3 sep 2026", o una sola fecha si el hilo tiene un mensaje. */
function rango(h: HiloDeReserva) {
  const ini = fecha(h.firstDate);
  const fin = fecha(h.date);
  if (ini && fin && ini !== fin) return `${ini} → ${fin}`;
  return fin || ini || "sin fecha";
}

/** El hilo en la bandeja, para cuando hay que leerlo completo antes de decidir. */
function enlaceGmail(threadId: string) {
  return `https://mail.google.com/mail/u/?authuser=elcaminoconnaty@gmail.com#all/${threadId}`;
}

/** "mar 2026 → dic 2026", para explicar qué se buscó. */
function ventanaLegible(v: { desde: string; hasta: string }) {
  const f = (s: string) => {
    const [a, m, d] = s.split("/").map(Number);
    return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("es-CO", { month: "short", year: "numeric" });
  };
  return `${f(v.desde)} → ${f(v.hasta)}`;
}

/**
 * La ficha guarda una dirección principal, pero la negociación viva puede estar en otra
 * de las alternas. Cuando el hilo no tiene la principal hay que decirlo, porque se ve
 * igual de legítimo que los demás.
 */
function avisoDeDirecciones(hilos: HiloDeReserva[], emails: string[]): string | null {
  if (hilos.length === 0 || emails.length < 2) return null;
  const otros = hilos.filter((h) => !h.coincideExacto);
  if (otros.length === 0) return null;
  return `${otros.length === hilos.length ? "Ninguno de estos hilos" : `${otros.length} de estos hilos`} es con ${emails[0]}, la dirección principal del proveedor: son de las alternas. Van marcados.`;
}

/**
 * Enlaza a la reserva el hilo de Gmail donde se negoció con el proveedor. Desde ahí, el
 * rooming list y el menú salen como respuesta dentro de ese hilo, desde
 * elcaminoconnaty@gmail.com. Los hilos los busca n8n con la cuenta de Gmail.
 *
 * Con un mismo proveedor hay varios hilos y todos se llaman parecido, así que la lista
 * muestra el arranque del hilo (donde se pidió el grupo y las fechas) además del último
 * mensaje: es lo que deja distinguir el hilo de este camino del de otro.
 */
export function GmailThreadDialog({
  reservationId,
  departureId,
  providerName,
  hilo,
  compacto,
}: {
  reservationId: string;
  departureId: string;
  providerName: string;
  hilo: { threadId: string; subject: string | null } | null;
  /** Solo el icono, para la fila de la tabla de reservas. */
  compacto?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [emails, setEmails] = React.useState<string[]>([]);
  const [ventana, setVentana] = React.useState<{ desde: string; hasta: string } | null>(null);
  const [ampliado, setAmpliado] = React.useState(false);
  const [hilos, setHilos] = React.useState<HiloDeReserva[]>([]);
  const [elegido, setElegido] = React.useState<string>(hilo?.threadId ?? "");
  const [filtro, setFiltro] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);

  async function cargar(todoElHistorico = false) {
    setCargando(true);
    setError(null);
    setAmpliado(todoElHistorico);
    try {
      const r = await buscarHilosDeReserva(reservationId, { todoElHistorico });
      if (!r.ok) {
        setError(r.error);
        setHilos([]);
        return;
      }
      setEmails(r.emails);
      setVentana(r.ventana);
      setHilos(r.hilos);
    } catch {
      setError("Se cortó la conexión. Volvé a intentar.");
    } finally {
      setCargando(false);
    }
  }

  React.useEffect(() => {
    if (!open) return;
    setElegido(hilo?.threadId ?? "");
    setFiltro("");
    cargar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visibles = React.useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return hilos;
    return hilos.filter((h) =>
      [h.subject, h.firstSnippet, h.snippet, h.fromName, h.participants.join(" ")].join(" ").toLowerCase().includes(q)
    );
  }, [hilos, filtro]);

  const aviso = avisoDeDirecciones(hilos, emails);

  async function guardar() {
    const h = hilos.find((x) => x.threadId === elegido);
    if (!h) return;
    setGuardando(true);
    try {
      const r = await enlazarHilo(reservationId, { threadId: h.threadId, lastMessageId: h.lastIncomingMessageId ?? h.lastMessageId, subject: h.subject }, departureId);
      if (!r.ok) {
        toast({ title: "No se pudo enlazar", description: r.error, variant: "destructive" });
        return;
      }
      toast({
        title: "Hilo enlazado",
        description: h.coincideExacto
          ? h.subject
          : `${h.subject} · Ojo: este hilo es con ${h.participants.join(", ")}, una dirección alterna. La respuesta llega igual al hilo.`,
        variant: "success",
      });
      setOpen(false);
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  async function quitar() {
    setGuardando(true);
    try {
      const r = await desenlazarHilo(reservationId, departureId);
      if (!r.ok) {
        toast({ title: "No se pudo desenlazar", description: r.error, variant: "destructive" });
        return;
      }
      toast({ title: "Hilo desenlazado" });
      setOpen(false);
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compacto ? (
          <Button type="button" variant="ghost" size="icon" className={cn("h-8 w-8", hilo && "text-ok-700")} title={hilo ? `Hilo de Gmail: ${hilo.subject ?? ""}` : "Enlazar el hilo de Gmail de esta reserva"}>
            {hilo ? <MailCheck className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" className={cn(hilo && "text-ok-700")} title={hilo ? `Hilo de Gmail: ${hilo.subject ?? ""}` : "Enlazar el hilo de Gmail de esta reserva"}>
            {hilo ? <MailCheck className="h-3 w-3" /> : <Link2 className="h-3 w-3" />} {hilo ? "Hilo enlazado" : "Enlazar hilo de Gmail"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hilo de Gmail · {providerName}</DialogTitle>
          <DialogDescription>
            Elegí el hilo donde se habló esta reserva. El rooming list y el menú saldrán como respuesta dentro de ese hilo,
            desde elcaminoconnaty@gmail.com.
          </DialogDescription>
        </DialogHeader>

        {hilo && (
          <div className="rounded-md border bg-ok-50 px-3 py-2 text-xs text-ok-900 flex items-center justify-between gap-2">
            <span className="truncate">Enlazado: <strong>{hilo.subject ?? hilo.threadId}</strong></span>
            <Button type="button" variant="ghost" size="sm" onClick={quitar} disabled={guardando}>
              <Link2Off className="h-3 w-3" /> Desenlazar
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {cargando
              ? "Buscando en Gmail… puede tardar cerca de un minuto"
              : emails.length > 0
                ? `${hilos.length} hilo${hilos.length === 1 ? "" : "s"} · ${emails.join(", ")}${ventana ? ` · ${ventanaLegible(ventana)}` : " · todo el histórico"}`
                : ""}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => cargar(ampliado)} disabled={cargando}>
            <RefreshCw className={cn("h-3 w-3", cargando && "animate-spin")} /> Buscar de nuevo
          </Button>
        </div>

        {error && <p className="text-xs rounded-md bg-error-50 text-error-900 p-2">{error}</p>}

        {!error && !cargando && aviso && hilos.length > 0 && (
          <p className="text-xs rounded-md border border-ocre/40 bg-ocre/10 p-2 text-ocre-profundo">{aviso}</p>
        )}

        {!error && !cargando && hilos.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {ventana
              ? "No hay correos con este proveedor en las fechas del camino."
              : "No hay ningún correo con este proveedor en la cuenta. El primer envío abrirá un hilo nuevo y quedará enlazado solo."}
          </p>
        )}

        {!error && !cargando && ventana && (
          <p className="text-[11px] text-muted-foreground">
            Solo se buscó en las fechas del camino, para no traer los hilos de los otros.{" "}
            <button type="button" onClick={() => cargar(true)} className="underline hover:text-foreground">
              Buscar en todo el histórico
            </button>
          </p>
        )}

        {hilos.length > 3 && (
          <Input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por grupo, fecha o texto del correo…"
            className="h-9 text-sm"
          />
        )}

        {!error && !cargando && hilos.length > 0 && visibles.length === 0 && (
          <p className="text-xs text-muted-foreground">Ningún hilo coincide con “{filtro}”.</p>
        )}

        <div className="space-y-1.5">
          {visibles.map((h) => (
            <label
              key={h.threadId}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm",
                elegido === h.threadId && "border-ocre bg-alba/60"
              )}
            >
              <input type="radio" name="hilo" className="mt-1 shrink-0" checked={elegido === h.threadId} onChange={() => setElegido(h.threadId)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="block font-medium truncate">{h.subject}</span>
                  {h.threadId === visibles[0]?.threadId && !filtro && h.puntaje >= 4 && (
                    <span className="shrink-0 rounded bg-ok-100 px-1 text-[10px] uppercase tracking-wide text-ok-900">probable</span>
                  )}
                  {h.unread && <span className="shrink-0 rounded bg-ocre/20 px-1 text-[10px] uppercase tracking-wide text-ocre-profundo">sin leer</span>}
                  {!h.coincideExacto && <span className="shrink-0 rounded bg-ocre/20 px-1 text-[10px] uppercase tracking-wide text-ocre-profundo">otra dirección</span>}
                </span>

                <span className="block text-xs text-muted-foreground">
                  {rango(h)} · {h.messageCount} mensaje{h.messageCount === 1 ? "" : "s"} · último de {h.fromName || h.from || "—"}
                  {!h.lastIncomingMessageId && " · el proveedor no ha respondido"}
                </span>

                {h.firstSnippet && (
                  <span className="mt-1 block text-xs text-muted-foreground line-clamp-2">
                    <span className="font-medium text-foreground/70">Empieza:</span> {h.firstSnippet}
                  </span>
                )}

                {h.messageCount > 1 && h.snippet && h.snippet !== h.firstSnippet && (
                  <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                    <span className="font-medium text-foreground/70">Último:</span> {h.snippet}
                  </span>
                )}

                <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  {h.participants.length > 0 && <span className="truncate">{h.participants.join(", ")}</span>}
                  <a
                    href={enlaceGmail(h.threadId)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="ml-auto shrink-0 inline-flex items-center gap-1 underline hover:text-foreground"
                  >
                    Abrir en Gmail <ExternalLink className="h-3 w-3" />
                  </a>
                </span>
              </span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" variant="accent" onClick={guardar} disabled={guardando || !elegido || elegido === hilo?.threadId}>
            {guardando ? "Guardando…" : "Enlazar este hilo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
