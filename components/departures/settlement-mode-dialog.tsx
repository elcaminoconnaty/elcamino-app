"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { setDepartureSettlementMode } from "@/lib/actions/settlement";
import { SETTLEMENT_MODE, type SettlementMode } from "@/lib/settlement";
import { toast } from "@/components/ui/toaster";
import { Settings2 } from "lucide-react";

/**
 * Modo de liquidación del camino. Cambiarlo no toca ningún pago: solo cambia si
 * los abonos en pesos se re-valoran a la tasa de cierre o se quedan con la tasa
 * del día en que se hicieron.
 */
export function SettlementModeDialog({
  departureId,
  currentMode,
  trigger,
}: {
  departureId: string;
  currentMode: SettlementMode;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SettlementMode>(currentMode);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function guardar() {
    setSaving(true);
    try {
      await setDepartureSettlementMode(departureId, mode);
      toast({ title: "Modo de liquidación actualizado", variant: "success" });
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
          <Button variant="outline" size="sm">
            <Settings2 className="h-3.5 w-3.5" /> Modo de liquidación
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modo de liquidación del camino</DialogTitle>
          <DialogDescription>
            Cómo se calcula el saldo final de cada peregrino. No modifica ningún pago: los abonos siempre conservan
            la tasa del día en que se hicieron.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {(Object.keys(SETTLEMENT_MODE) as SettlementMode[]).map((m) => {
            const info = SETTLEMENT_MODE[m];
            const seleccionado = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`w-full text-left rounded-md border p-3 transition-colors ${
                  seleccionado ? "border-ocre border-2 bg-alba" : "hover:bg-alba"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`h-3.5 w-3.5 rounded-full border-2 shrink-0 ${seleccionado ? "border-ocre-profundo bg-ocre" : "border-muted-foreground"}`} />
                  <span className="font-medium text-sm">{info.label}</span>
                  {m === currentMode && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">actual</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-snug pl-[22px]">{info.description}</p>
              </button>
            );
          })}
        </div>

        {mode !== currentMode && (
          <p className="text-xs rounded-md bg-aviso-50 text-aviso-900 p-2">
            {mode === "sin_recalculo"
              ? "Los saldos van a pasar a calcularse sin re-valorar: cada abono valdrá los euros que valió el día que se hizo. La tasa de cierre que tenga el camino queda guardada pero sin efecto."
              : "Los saldos van a pasar a calcularse re-valorando los abonos en pesos a la tasa de cierre. Si el camino todavía no tiene tasa, habrá que fijarla."}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="accent" onClick={guardar} disabled={saving || mode === currentMode}>
            {saving ? "Guardando..." : "Guardar modo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
