"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPenaltyMovement, getTrmForDate } from "@/lib/actions/payments";
import { toast } from "@/components/ui/toaster";
import { formatEUR, formatCOP, formatDate } from "@/lib/utils";
import { CONCEPTO_PENALIDAD } from "@/lib/settlement";
import { MinusCircle } from "lucide-react";

/**
 * Registrar una penalidad: un movimiento en negativo dentro de los pagos del
 * peregrino. No le sube el precio del viaje — se la descuenta de sus propios
 * abonos, que es como se lee en el recibo. Se escribe en euros o en pesos y la
 * otra cifra sale con la tasa del día en que se pactó; esa tasa queda guardada,
 * así que aunque después se mueva, la penalidad en pesos sigue siendo la que se
 * le informó.
 */
export function NewPenaltyDialog({ registrationId }: { registrationId: string }) {
  const [open, setOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<"EUR" | "COP">("EUR");
  const [monto, setMonto] = useState("");
  const [trm, setTrm] = useState("");
  const [buscandoTrm, setBuscandoTrm] = useState(false);
  const [concept, setConcept] = useState(CONCEPTO_PENALIDAD);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const tasa = Number(trm) || 0;
  // Se escribe en la divisa en que se pactó; la otra cifra es la conversión a la
  // tasa de ese día, y queda guardada con el movimiento.
  const valor = Number(monto) || 0;
  const montoEur = currency === "EUR" ? valor : tasa > 0 ? valor / tasa : 0;
  const montoCop = currency === "COP" ? valor : tasa > 0 ? Math.round(valor * tasa) : 0;

  // La tasa del día sale de /trm; si no hay ninguna cargada, se escribe a mano.
  useEffect(() => {
    if (!open || !paidAt) return;
    let vigente = true;
    setBuscandoTrm(true);
    getTrmForDate(paidAt)
      .then((r) => {
        if (vigente && r) setTrm(String(r));
      })
      .finally(() => vigente && setBuscandoTrm(false));
    return () => {
      vigente = false;
    };
  }, [open, paidAt]);

  async function submit() {
    if (!valor || valor <= 0) {
      toast({ title: "Monto inválido", variant: "destructive" });
      return;
    }
    if (currency === "COP" && tasa <= 0) {
      toast({
        title: "Falta la tasa",
        description: "Escribí la tasa COP/EUR del día en que se pactó, o cargala en /trm.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await createPenaltyMovement({
        registration_id: registrationId,
        paid_at: paidAt,
        amount: valor,
        currency,
        trm_eur_cop: tasa > 0 ? tasa : null,
        concept,
        notes: notes || null,
      });
      toast({ title: "Penalidad registrada", variant: "success" });
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
        <Button variant="outline" size="sm"><MinusCircle className="h-4 w-4" /> Penalidad</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar penalidad</DialogTitle>
          <DialogDescription>
            Queda como un movimiento en negativo entre sus pagos. El precio del viaje no cambia: en el recibo la
            penalidad se le resta a lo que ya abonó.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Fecha en que se pactó *</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Se pactó en</Label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "EUR" | "COP")}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="EUR">Euros</option>
                <option value="COP">Pesos</option>
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Tasa COP/EUR de ese día</Label>
            <Input
              type="number"
              step="0.01"
              value={trm}
              onChange={(e) => setTrm(e.target.value)}
              placeholder={buscandoTrm ? "Buscando…" : "4500.00"}
            />
            {!buscandoTrm && !trm && paidAt && (
              <p className="text-xs text-aviso-700">
                No hay TRM cargada para {formatDate(paidAt)}. Escribila a mano o cargala en /trm.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Penalidad ({currency === "EUR" ? "EUR" : "COP"}) *</Label>
            <Input
              type="number"
              step={currency === "EUR" ? "0.01" : "1"}
              min="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
            {valor > 0 && tasa > 0 && (
              <p className="text-xs text-muted-foreground">
                {currency === "EUR"
                  ? `Equivale a ${formatCOP(montoCop)} a la tasa de ese día.`
                  : `Equivale a ${formatEUR(montoEur)} a la tasa de ese día.`}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Concepto *</Label>
            <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder={CONCEPTO_PENALIDAD} />
            <p className="text-xs text-muted-foreground">Es el texto que ve el peregrino en su recibo.</p>
          </div>

          <div className="grid gap-2">
            <Label>Notas internas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {montoEur > 0 && (
            <p className="text-xs text-muted-foreground">
              Se le van a descontar <strong>{formatEUR(montoEur)}</strong> de lo abonado. Su saldo sube en esa misma
              cantidad y el precio del viaje no se mueve.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="accent" onClick={submit} disabled={saving}>{saving ? "Guardando..." : "Registrar penalidad"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
