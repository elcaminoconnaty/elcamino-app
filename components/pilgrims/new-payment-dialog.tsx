"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPilgrimPayment, getTrmForDate } from "@/lib/actions/payments";
import { PAYMENT_METHODS, ACCOUNTS } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { CreditCard } from "lucide-react";

export function NewPaymentDialog({
  registrationId,
  departureId,
  pilgrimPaysInCop,
}: {
  registrationId: string;
  departureId: string;
  pilgrimPaysInCop: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"EUR" | "COP" | "USD">(pilgrimPaysInCop ? "COP" : "EUR");
  const [trm, setTrm] = useState("");
  const [usdRate, setUsdRate] = useState("");
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [account, setAccount] = useState(ACCOUNTS[0]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (currency === "COP" && open) {
      getTrmForDate(paidAt).then((r) => {
        if (r) setTrm(String(r));
      });
    }
  }, [currency, paidAt, open]);

  async function submit() {
    setSaving(true);
    try {
      const a = Number(amount);
      if (!a || a <= 0) throw new Error("Monto inválido");
      await createPilgrimPayment({
        registration_id: registrationId,
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
      toast({ title: "Pago registrado", variant: "success" });
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
        <Button variant="accent" size="sm"><CreditCard className="h-4 w-4" /> Nuevo pago</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>Se calcula automáticamente el equivalente en EUR usando la TRM del día.</DialogDescription>
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
              </select>
            </div>
          </div>
          {currency === "COP" && (
            <div className="grid gap-2">
              <Label>TRM EUR/COP (autocompletado desde TRM del día)</Label>
              <Input type="number" step="0.01" value={trm} onChange={(e) => setTrm(e.target.value)} placeholder="4500.00" />
              {!trm && <p className="text-xs text-amber-700">No hay TRM cargada para {paidAt}. Ingresá una manual o cargá una en /trm.</p>}
            </div>
          )}
          <div className="grid gap-2">
            <Label>Cuenta / dónde entra la plata</Label>
            <select value={account} onChange={(e) => setAccount(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="grid gap-2"><Label>Referencia</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Tracking, n° transacción" /></div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="accent" onClick={submit} disabled={saving}>{saving ? "Guardando..." : "Registrar pago"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
