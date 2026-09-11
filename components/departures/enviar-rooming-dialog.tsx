"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { previsualizarRoomingList, enviarRoomingListAlHotel, type VistaPreviaRooming } from "@/lib/actions/rooming-email";
import { formatDate } from "@/lib/utils";
import { Send, MailCheck } from "lucide-react";

/**
 * Manda el rooming list de una noche al hotel: vista previa del correo (tabla con
 * huéspedes y pasaportes), el Excel adjunto, y sale dentro del hilo de Gmail enlazado.
 */
export function EnviarRoomingDialog({
  reservationId,
  hotel,
  enviadoEl,
}: {
  reservationId: string;
  hotel: string;
  enviadoEl: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [vista, setVista] = React.useState<VistaPreviaRooming | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cargando, setCargando] = React.useState(false);
  const [nota, setNota] = React.useState("");
  const [enviando, setEnviando] = React.useState<"hotel" | "prueba" | null>(null);

  async function cargar(notaExtra: string) {
    setCargando(true);
    setError(null);
    try {
      const r = await previsualizarRoomingList(reservationId, notaExtra || null);
      if (!r.ok) {
        setError(r.error);
        setVista(null);
        return;
      }
      setVista(r);
    } catch {
      setError("Se cortó la conexión. Volvé a intentar.");
    } finally {
      setCargando(false);
    }
  }

  React.useEffect(() => {
    if (open) cargar(nota);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function enviar(copiaAMi: boolean) {
    if (!vista) return;
    if (!copiaAMi && !window.confirm(`¿Mandar el rooming list a ${vista.to}${vista.hilo ? " dentro del hilo" : " como correo nuevo"}?`)) return;
    setEnviando(copiaAMi ? "prueba" : "hotel");
    try {
      const r = await enviarRoomingListAlHotel(reservationId, { copiaAMi, notaExtra: nota || null });
      if (!r.ok) {
        toast({ title: "No se pudo enviar", description: r.error, variant: "destructive" });
        return;
      }
      toast({ title: copiaAMi ? "Copia de prueba enviada" : "Rooming list enviado", description: `A ${r.to} por ${r.via === "gmail" ? "Gmail" : "Brevo"}`, variant: "success" });
      if (!copiaAMi) {
        setOpen(false);
        router.refresh();
      }
    } catch {
      toast({ title: "No se pudo enviar", description: "Se cortó la conexión. Revisá si salió antes de repetir.", variant: "destructive" });
    } finally {
      setEnviando(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={enviadoEl ? "ghost" : "outline"} size="sm" title={enviadoEl ? `Enviado el ${formatDate(enviadoEl.slice(0, 10))}` : "Mandar el rooming list al hotel por correo"}>
          {enviadoEl ? <MailCheck className="h-3 w-3 text-ok-700" /> : <Send className="h-3 w-3" />}
          {enviadoEl ? `Enviado ${formatDate(enviadoEl.slice(0, 10))}` : `Enviar a ${hotel}`}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rooming list para {hotel}</DialogTitle>
          <DialogDescription>Así le llega al hotel, con el Excel adjunto. Revisalo y tocá Enviar.</DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs rounded-md bg-error-50 text-error-900 p-2">{error}</p>}
        {vista?.aviso && <p className="text-xs rounded-md bg-aviso-50 text-aviso-900 p-2">{vista.aviso}</p>}

        {vista && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div><strong className="text-foreground">Para:</strong> {vista.to ?? "—"}</div>
            <div><strong className="text-foreground">Asunto:</strong> {vista.subject}</div>
            <div><strong className="text-foreground">Adjunto:</strong> {vista.filename} · {vista.habitaciones} habitaciones · {vista.personas} personas</div>
            <div>
              <strong className="text-foreground">Sale:</strong>{" "}
              {vista.via === "gmail" ? (vista.hilo ? `por Gmail, dentro del hilo "${vista.hilo.subject ?? ""}"` : "por Gmail, como correo nuevo") : "por Brevo desde reservas@ (fuera del hilo)"}
            </div>
          </div>
        )}

        <div className="grid gap-1">
          <label className="text-[10px] text-muted-foreground">Nota extra para el hotel (opcional)</label>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} onBlur={() => cargar(nota)} rows={2} className="text-xs min-h-[48px]" placeholder="Ej.: Llegamos sobre las 17:00. Una de las dobles la necesitamos con dos camas." />
        </div>

        <div className="rounded-md border overflow-hidden bg-white" style={{ height: 420 }}>
          {vista ? (
            <iframe title="Vista previa" srcDoc={vista.html} className="w-full h-full" sandbox="" />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{cargando ? "Armando el correo…" : "—"}</div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => enviar(true)} disabled={!vista || !!enviando}>
            {enviando === "prueba" ? "Enviando…" : "Enviarme una copia de prueba"}
          </Button>
          <Button type="button" variant="accent" onClick={() => enviar(false)} disabled={!vista || !vista.to || !!enviando}>
            <Send className="h-4 w-4" /> {enviando === "hotel" ? "Enviando…" : "Enviar al hotel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
