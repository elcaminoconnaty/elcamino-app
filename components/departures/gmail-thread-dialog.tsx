"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { buscarHilosDeReserva, enlazarHilo, desenlazarHilo } from "@/lib/actions/gmail-thread";
import type { HiloGmail } from "@/lib/email/gmail";
import { Link2, Link2Off, MailCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function fecha(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Enlaza a la reserva el hilo de Gmail donde se negoció con el proveedor. Desde ahí, el
 * rooming list y el menú salen como respuesta dentro de ese hilo, desde
 * elcaminoconnaty@gmail.com. Los hilos los busca n8n con la cuenta de Gmail.
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
  const [email, setEmail] = React.useState<string>("");
  const [hilos, setHilos] = React.useState<HiloGmail[]>([]);
  const [elegido, setElegido] = React.useState<string>(hilo?.threadId ?? "");
  const [guardando, setGuardando] = React.useState(false);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const r = await buscarHilosDeReserva(reservationId);
      if (!r.ok) {
        setError(r.error);
        setHilos([]);
        return;
      }
      setEmail(r.email);
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
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      toast({ title: "Hilo enlazado", description: h.subject, variant: "success" });
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
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
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
          <span>{email ? `Correos con ${email}` : cargando ? "Buscando en Gmail…" : ""}</span>
          <Button type="button" variant="ghost" size="sm" onClick={cargar} disabled={cargando}>
            <RefreshCw className={cn("h-3 w-3", cargando && "animate-spin")} /> Buscar de nuevo
          </Button>
        </div>

        {error && <p className="text-xs rounded-md bg-error-50 text-error-900 p-2">{error}</p>}

        {!error && !cargando && hilos.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay correos con ese proveedor en los últimos meses. El primer envío abrirá un hilo nuevo y quedará enlazado solo.</p>
        )}

        <div className="space-y-1.5">
          {hilos.map((h) => (
            <label key={h.threadId} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm", elegido === h.threadId && "border-ocre bg-alba/60")}>
              <input type="radio" name="hilo" className="mt-1" checked={elegido === h.threadId} onChange={() => setElegido(h.threadId)} />
              <span className="min-w-0">
                <span className="block font-medium truncate">{h.subject}</span>
                <span className="block text-xs text-muted-foreground">
                  {fecha(h.date)} · {h.messageCount} mensaje{h.messageCount === 1 ? "" : "s"} · último de {h.from || "—"}
                  {!h.lastIncomingMessageId && " · el hotel no ha respondido"}
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
