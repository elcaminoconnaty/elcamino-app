"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { freezeDepartureSettlementTrm, clearDepartureSettlementTrm } from "@/lib/actions/settlement";
import { getTrmForDate } from "@/lib/actions/payments";
import { toast } from "@/components/ui/toaster";
import { useRouter } from "next/navigation";
import { AlertTriangle, Landmark } from "lucide-react";

/**
 * Fija, cambia o quita la tasa de cierre del camino. Se puede usar en cualquier
 * momento — la liquidación final se hace cuando Naty decida, no en una ventana
 * fija de fechas. Los pagos no se modifican nunca: la tasa solo cambia cómo se
 * lee el saldo.
 */
export function SettlementRateDialog({
  departureId,
  currentTrm,
  currentDate,
  trigger,
}: {
  departureId: string;
  currentTrm: number | null;
  currentDate: string | null;
  trigger?: React.ReactNode;
}) {
  const yaTiene = currentTrm != null && Number(currentTrm) > 0;
  const [open, setOpen] = useState(false);
  const [trm, setTrm] = useState(yaTiene ? String(currentTrm) : "");
  const [date, setDate] = useState(currentDate ?? new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Se propone la TRM cargada para esa fecha; queda editable porque la tasa de
  // cierre es una decisión comercial, no necesariamente la TRM del día.
  useEffect(() => {
    if (!open || yaTiene) return;
    getTrmForDate(date).then((r) => { if (r) setTrm(String(r)); });
  }, [open, date, yaTiene]);

  async function guardar() {
    const n = Number(trm);
    if (!n || n <= 0) {
      toast({ title: "Tasa inválida", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await freezeDepartureSettlementTrm(departureId, n, date);
      toast({ title: yaTiene ? "Tasa de cierre actualizada" : "Tasa de cierre fijada", variant: "success" });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function quitar() {
    if (!confirm("¿Quitar la tasa de cierre? Los saldos vuelven a mostrarse sin recalcular. Los pagos no se tocan.")) return;
    setSaving(true);
    try {
      await clearDepartureSettlementTrm(departureId);
      toast({ title: "Tasa de cierre quitada", variant: "success" });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={yaTiene ? "outline" : "accent"} size="sm">
            <Landmark className="h-3.5 w-3.5" /> {yaTiene ? "Cambiar tasa de cierre" : "Fijar tasa de cierre"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{yaTiene ? "Cambiar la tasa de cierre" : "Fijar la tasa de cierre"}</DialogTitle>
          <DialogDescription>
            Con esta tasa se re-valoran todos los abonos que se quedaron en pesos. Los pagos no se modifican: cada
            uno conserva la tasa del día en que se hizo y el recálculo se muestra aparte.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="freeze-date">Fecha de la tasa</Label>
            <Input id="freeze-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="freeze-trm">Tasa EUR/COP</Label>
            <Input id="freeze-trm" type="number" step="0.01" value={trm} onChange={(e) => setTrm(e.target.value)} placeholder="3896.80" />
            {!trm && (
              <p className="text-xs text-aviso-700">
                No hay TRM cargada para esa fecha. Escribí la tasa a mano o cargala en /trm.
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {yaTiene
              ? "Al cambiarla, todos los saldos de la liquidación se recalculan al instante. Los pagos de cierre y las devoluciones ya registrados conservan la tasa con la que se hicieron."
              : "Después de fijarla, la liquidación muestra a quién le falta pagar y a quién hay que devolverle. Podés cambiarla o quitarla cuando quieras."}
          </p>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          {yaTiene ? (
            <Button variant="destructive" size="sm" onClick={quitar} disabled={saving}>
              Quitar tasa
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="accent" onClick={guardar} disabled={saving}>
              {saving ? "Guardando..." : yaTiene ? "Actualizar tasa" : "Fijar tasa"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Aviso para fijar la tasa de cierre cuando el camino todavía no la tiene. */
export function FreezeTrmBanner({
  departureId,
  startDate,
  urgente,
}: {
  departureId: string;
  startDate: string;
  /** La salida ya está encima: el aviso se muestra en amarillo fuerte. */
  urgente?: boolean;
}) {
  return (
    <Card className={urgente ? "border-ocre border-2 bg-ocre/10" : ""}>
      <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${urgente ? "text-ocre-profundo" : "text-muted-foreground"}`} />
          <div>
            <div className="font-medium">Este camino todavía no tiene tasa de cierre</div>
            <p className="text-sm text-muted-foreground">
              La salida es el {startDate}. Cuando quieras hacer la liquidación final, fijá la tasa y se recalculan
              todos los abonos que se hicieron en pesos.
            </p>
          </div>
        </div>
        <SettlementRateDialog
          departureId={departureId}
          currentTrm={null}
          currentDate={null}
          trigger={<Button variant="accent">Fijar tasa de cierre</Button>}
        />
      </CardContent>
    </Card>
  );
}
