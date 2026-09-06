"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPilgrimPayment, getTrmForDate } from "@/lib/actions/payments";
import { PAYMENT_METHODS, ACCOUNTS, GLOBAL66 } from "@/lib/constants";
import { Global66Fields } from "@/components/ui/global66-fields";
import { global66Rate } from "@/lib/global66";
import { toast } from "@/components/ui/toaster";
import { CreditCard } from "lucide-react";

export function NewPaymentDialog({
  registrationId,
  departureId,
  pilgrimPaysInCop,
  settlementTrm,
}: {
  registrationId: string;
  departureId: string;
  pilgrimPaysInCop: boolean;
  /** Si la salida ya cerró su tasa, los pagos en pesos van con ella, no con la del día. */
  settlementTrm?: number | null;
}) {
  const tasaCierre = settlementTrm ? Number(settlementTrm) : 0;
  const [open, setOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"EUR" | "COP" | "USD">(pilgrimPaysInCop ? "COP" : "EUR");
  const [trm, setTrm] = useState("");
  const [usdRate, setUsdRate] = useState("");
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [account, setAccount] = useState(ACCOUNTS[0]);
  const [eurReceived, setEurReceived] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Global 66: la peregrina paga en COP y a la cuenta entran euros a la tasa de
  // Global 66. La cuenta destino es la propia Global 66.
  const esGlobal66 = method === GLOBAL66;
  const conversionGlobal66 = esGlobal66 && currency === "COP";

  // Con la tasa de cierre ya fijada, un abono en pesos se convierte con ella:
  // es la tasa que se le prometió al peregrino y la que usa su liquidación.
  useEffect(() => {
    if (currency !== "COP" || !open) return;
    if (tasaCierre > 0) {
      setTrm(String(tasaCierre));
      return;
    }
    getTrmForDate(paidAt).then((r) => {
      if (r) setTrm(String(r));
    });
  }, [currency, paidAt, open, tasaCierre]);

  function onMethodChange(m: string) {
    setMethod(m);
    if (m === GLOBAL66) {
      setAccount(GLOBAL66);
      setCurrency("COP");
    }
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
      await createPilgrimPayment({
        registration_id: registrationId,
        paid_at: paidAt,
        amount: a,
        currency,
        trm_eur_cop: conversionGlobal66 ? tasaGlobal66 : currency === "COP" ? Number(trm) || null : null,
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
          <DialogDescription>
            {tasaCierre > 0
              ? "Esta salida ya tiene tasa de cierre: los pagos en pesos se convierten con ella."
              : "Se calcula automáticamente el equivalente en EUR usando la TRM del día."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Fecha *</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Método</Label>
              <select value={method} onChange={(e) => onMethodChange(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
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
          {conversionGlobal66 && (
            <Global66Fields
              amountCop={Number(amount)}
              eur={eurReceived}
              onEurChange={setEurReceived}
              marketTrm={Number(trm) || null}
              direction="in"
            />
          )}
          {currency === "COP" && !conversionGlobal66 && (
            <div className="grid gap-2">
              <Label>
                {tasaCierre > 0 ? "Tasa de cierre EUR/COP" : "TRM EUR/COP (autocompletado desde TRM del día)"}
              </Label>
              <Input type="number" step="0.01" value={trm} onChange={(e) => setTrm(e.target.value)} placeholder="4500.00" />
              {tasaCierre > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Esta salida ya tiene tasa de cierre ({tasaCierre.toLocaleString("es-CO")} COP/EUR), así que el pago
                  se convierte con ella y no con la TRM de hoy.
                </p>
              ) : (
                !trm && <p className="text-xs text-aviso-700">No hay TRM cargada para {paidAt}. Ingresá una manual o cargá una en /trm.</p>
              )}
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
