"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setRegistrationSettlementTrm } from "@/lib/actions/settlement";
import { getTrmForDate } from "@/lib/actions/payments";
import { toast } from "@/components/ui/toaster";
import { Landmark } from "lucide-react";

/**
 * Tasa de cierre pactada aparte con un peregrino. Lo normal es usar la del grupo
 * (se fija en la ficha del camino); esto es para la excepción — alguien con quien
 * se acordó otra tasa.
 */
export function SettlementTrmDialog({
  registrationId,
  pilgrimName,
  currentTrm,
  esExcepcion,
  trigger,
}: {
  registrationId: string;
  pilgrimName: string;
  currentTrm: number | null;
  /** Si la tasa actual es propia de la inscripción y no heredada de la salida. */
  esExcepcion: boolean;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [trm, setTrm] = useState(esExcepcion && currentTrm ? String(currentTrm) : "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (open && !trm) {
      getTrmForDate(date).then((r) => { if (r) setTrm(String(r)); });
    }
  }, [open, date, trm]);

  async function guardar(limpiar = false) {
    setSaving(true);
    try {
      const n = limpiar ? null : Number(trm);
      if (!limpiar && (!n || n <= 0)) throw new Error("Tasa inválida.");
      await setRegistrationSettlementTrm(registrationId, n, date);
      toast({ title: limpiar ? "Vuelve a usar la tasa del grupo" : "Tasa de cierre guardada", variant: "success" });
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
          <Button variant="outline" size="sm"><Landmark className="h-3.5 w-3.5" /> Tasa de cierre propia</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tasa de cierre de {pilgrimName}</DialogTitle>
          <DialogDescription>
            Con esta tasa se re-valoran todos los abonos en pesos de {pilgrimName}. Solo hace falta si se pactó
            una distinta a la del grupo — si no, dejá que herede la de la salida.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>Tasa EUR/COP</Label>
            <Input type="number" step="0.01" value={trm} onChange={(e) => setTrm(e.target.value)} placeholder="3896.80" />
          </div>
          <div className="grid gap-2">
            <Label>Fecha de la tasa</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            No se modifica ningún pago: los abonos conservan la tasa con la que se hicieron y el recálculo se
            muestra aparte.
          </p>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          {esExcepcion ? (
            <Button variant="destructive" size="sm" onClick={() => guardar(true)} disabled={saving}>
              Usar la del grupo
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="accent" onClick={() => guardar(false)} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
