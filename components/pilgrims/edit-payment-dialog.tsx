"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updatePilgrimPayment, deletePilgrimPayment } from "@/lib/actions/payments";
import { PAYMENT_METHODS, ACCOUNTS } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { Pencil, Trash2 } from "lucide-react";

export function EditPaymentDialog({ payment }: { payment: any }) {
  const [open, setOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(payment.paid_at);
  const [amount, setAmount] = useState(String(payment.amount));
  const [currency, setCurrency] = useState<"EUR" | "COP" | "USD">(payment.currency);
  const [trm, setTrm] = useState(payment.trm_eur_cop != null ? String(payment.trm_eur_cop) : "");
  const [usdRate, setUsdRate] = useState(payment.usd_eur_rate != null ? String(payment.usd_eur_rate) : "");
  const [method, setMethod] = useState(payment.method ?? PAYMENT_METHODS[0]);
  const [account, setAccount] = useState(payment.account ?? ACCOUNTS[0]);
  const [reference, setReference] = useState(payment.reference ?? "");
  const [notes, setNotes] = useState(payment.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function submit() {
    setSaving(true);
    try {
      const a = Number(amount);
      if (!a || a <= 0) throw new Error("Monto inválido");
      await updatePilgrimPayment(payment.id, {
        paid_at: paidAt,
        amount: a,
        currency,
        trm_eur_cop: currency === "COP" ? Number(trm) || null : null,
        usd_eur_rate: currency === "USD" ? Number(usdRate) || null : null,
        method,
        account,
        reference: reference || null,
        notes: notes || null,
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
    if (!confirm("¿Eliminar este pago? Esta acción no se puede deshacer.")) return;
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
          <DialogTitle>Editar pago</DialogTitle>
          <DialogDescription>Modificá los datos del pago. El recibo PDF reflejará los cambios.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Fecha *</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Método</Label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Monto *</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Divisa</Label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="EUR">EUR</option>
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          {currency === "COP" && (
            <div className="grid gap-2"><Label>TRM EUR/COP</Label><Input type="number" step="0.01" value={trm} onChange={(e) => setTrm(e.target.value)} /></div>
          )}
          {currency === "USD" && (
            <div className="grid gap-2"><Label>Tasa USD→EUR (cuántos EUR vale 1 USD)</Label><Input type="number" step="0.0001" value={usdRate} onChange={(e) => setUsdRate(e.target.value)} placeholder="Ej. 0.92" /></div>
          )}
          <div className="grid gap-2">
            <Label>Cuenta / dónde entró la plata</Label>
            <select value={account} onChange={(e) => setAccount(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="grid gap-2"><Label>Referencia</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
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
