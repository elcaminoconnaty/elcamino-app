"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updatePilgrimPayment, deletePilgrimPayment } from "@/lib/actions/payments";
import { PAYMENT_METHODS, ACCOUNTS, GLOBAL66 } from "@/lib/constants";
import { Global66Fields } from "@/components/ui/global66-fields";
import { global66Rate } from "@/lib/global66";
import { toast } from "@/components/ui/toaster";
import { PAYMENT_KIND, type PaymentKind } from "@/lib/settlement";
import { Pencil, Trash2 } from "lucide-react";

export function EditPaymentDialog({ payment }: { payment: any }) {
  const [open, setOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(payment.paid_at);
  const kind: PaymentKind = payment.kind ?? "abono";
  const esDevolucion = kind === "devolucion";
  // Una penalidad no pasa por ninguna cuenta ni tiene medio de pago: lo suyo es
  // el concepto, el monto y la tasa del día en que se pactó.
  const esPenalidad = kind === "penalidad";
  const [amount, setAmount] = useState(String(Math.abs(Number(payment.amount))));
  const [currency, setCurrency] = useState<"EUR" | "COP" | "USD">(payment.currency);
  const [trm, setTrm] = useState(payment.trm_eur_cop != null ? String(payment.trm_eur_cop) : "");
  const [usdRate, setUsdRate] = useState(payment.usd_eur_rate != null ? String(payment.usd_eur_rate) : "");
  const [method, setMethod] = useState(payment.method ?? PAYMENT_METHODS[0]);
  const [account, setAccount] = useState(payment.account ?? ACCOUNTS[0]);
  const [eurReceived, setEurReceived] = useState(payment.amount_eur != null ? String(payment.amount_eur) : "");
  const [reference, setReference] = useState(payment.reference ?? "");
  const [notes, setNotes] = useState(payment.notes ?? "");
  const [concept, setConcept] = useState(payment.concept ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const conversionGlobal66 = method === GLOBAL66 && currency === "COP";

  function onMethodChange(m: string) {
    setMethod(m);
    if (m === GLOBAL66) setAccount(GLOBAL66);
  }

  async function submit() {
    setSaving(true);
    try {
      const a = Number(amount);
      if (!a || a <= 0) throw new Error("Monto inválido");
      const tasaGlobal66 = conversionGlobal66 ? global66Rate(a, Number(eurReceived)) : null;
      if (conversionGlobal66 && !tasaGlobal66) {
        throw new Error(`Indicá los euros que entraron a ${GLOBAL66}.`);
      }
      if (esPenalidad && !concept.trim()) throw new Error("Escribí el concepto de la penalidad.");
      await updatePilgrimPayment(payment.id, {
        paid_at: paidAt,
        amount: a,
        currency,
        // En una penalidad la tasa es de referencia y se guarda aunque sea en euros.
        trm_eur_cop: conversionGlobal66
          ? tasaGlobal66
          : esPenalidad || currency === "COP"
            ? Number(trm) || null
            : null,
        usd_eur_rate: currency === "USD" ? Number(usdRate) || null : null,
        method: esPenalidad ? null : method,
        account: esPenalidad ? null : account,
        reference: esPenalidad ? null : reference || null,
        notes: notes || null,
        ...(esPenalidad ? { concept: concept.trim() } : {}),
      });
      toast({ title: "Pago actualizado", variant: "success" });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function onDelete() {
    if (!confirm(`¿Eliminar ${esPenalidad ? "esta penalidad" : "este pago"}? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await deletePilgrimPayment(payment.id);
      toast({ title: "Pago eliminado", variant: "success" });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeleting(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Pencil className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {kind === "abono" ? "pago" : PAYMENT_KIND[kind].label.toLowerCase()}</DialogTitle>
          <DialogDescription>
            {esDevolucion
              ? "Monto en positivo: es plata que sale, y se guarda como tal."
              : esPenalidad
                ? "Monto en positivo: es lo que se le descuenta de lo abonado. El precio del viaje no cambia."
                : "Modificá los datos del pago. El recibo PDF reflejará los cambios."}
            {kind === "cierre" && " Este es el pago de cierre, calculado a la tasa de cierre de la salida."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>{esPenalidad ? "Fecha en que se pactó *" : "Fecha *"}</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
            {!esPenalidad && (
              <div className="grid gap-2"><Label>Método</Label>
                <select value={method} onChange={(e) => onMethodChange(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
          </div>
          {esPenalidad && (
            <div className="grid gap-2">
              <Label>Concepto *</Label>
              <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Penalidad por cambio de grupo" />
              <p className="text-xs text-muted-foreground">Es el texto que ve el peregrino en su recibo.</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>{esDevolucion ? "Monto devuelto *" : esPenalidad ? "Penalidad *" : "Monto *"}</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Divisa</Label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="EUR">EUR</option>
                <option value="COP">COP</option>
              </select>
            </div>
          </div>
          {conversionGlobal66 && (
            <Global66Fields
              amountCop={Number(amount)}
              eur={eurReceived}
              onEurChange={setEurReceived}
              marketTrm={null}
              direction="in"
            />
          )}
          {(currency === "COP" || esPenalidad) && !conversionGlobal66 && (
            <div className="grid gap-2">
              <Label>{esPenalidad ? "Tasa COP/EUR de ese día" : "TRM EUR/COP"}</Label>
              <Input type="number" step="0.01" value={trm} onChange={(e) => setTrm(e.target.value)} />
              {esPenalidad && currency === "EUR" && (
                <p className="text-xs text-muted-foreground">
                  No convierte nada: queda de referencia para poder decirle cuántos pesos eran ese día.
                </p>
              )}
            </div>
          )}
          {!esPenalidad && (
            <>
              <div className="grid gap-2">
                <Label>{esDevolucion ? "Cuenta de donde salió la plata" : "Cuenta / dónde entró la plata"}</Label>
                <select value={account} onChange={(e) => setAccount(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="grid gap-2"><Label>Referencia</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
            </>
          )}
          <div className="grid gap-2"><Label>{esPenalidad ? "Notas internas" : "Notas"}</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button type="button" variant="destructive" size="sm" onClick={onDelete} disabled={deleting}>
            <Trash2 className="h-4 w-4" /> {deleting ? "Eliminando..." : "Eliminar"}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="accent" onClick={submit} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
