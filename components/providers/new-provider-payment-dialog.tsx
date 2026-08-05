"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProviderPayment } from "@/lib/actions/reservations";
import { PAYMENT_METHODS, ACCOUNTS, GLOBAL66 } from "@/lib/constants";
import { Global66Fields } from "@/components/ui/global66-fields";
import { toast } from "@/components/ui/toaster";
import { Plus } from "lucide-react";

export function NewProviderPaymentDialog({ providerId, reservations, departures }: { providerId: string; reservations: any[]; departures: any[] }) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<"EUR" | "COP">("EUR");
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [account, setAccount] = useState(ACCOUNTS[0]);
  const [amount, setAmount] = useState("");
  const [eurSent, setEurSent] = useState("");
  const router = useRouter();

  // Con Global 66 se debita COP y al proveedor le llegan euros a la tasa de Global 66.
  const conversionGlobal66 = method === GLOBAL66 && currency === "COP";

  function onMethodChange(m: string) {
    setMethod(m);
    if (m === GLOBAL66) setAccount(GLOBAL66);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm"><Plus className="h-4 w-4" /> Pago</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo pago a proveedor</DialogTitle></DialogHeader>
        <form
          action={async (fd) => {
            try {
              fd.set("provider_id", providerId);
              await createProviderPayment(fd);
              toast({ title: "Pago registrado", variant: "success" });
              setOpen(false);
              router.refresh();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
          }}
          className="space-y-3"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Fecha</Label><Input name="paid_at" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></div>
            <div className="grid gap-2"><Label>Método</Label>
              <select name="method" value={method} onChange={(e) => onMethodChange(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-2"><Label>Monto *</Label><Input name="amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
            <div className="grid gap-2"><Label>Divisa</Label>
              <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="EUR">EUR</option>
                <option value="COP">COP</option>
              </select>
            </div>
          </div>
          {conversionGlobal66 && (
            <Global66Fields
              amountCop={Number(amount)}
              eur={eurSent}
              onEurChange={setEurSent}
              direction="out"
              trmInputName="trm_eur_cop"
            />
          )}
          {currency === "COP" && !conversionGlobal66 && (
            <div className="grid gap-2"><Label>TRM (COP por EUR)</Label><Input name="trm_eur_cop" type="number" step="0.01" placeholder="Se autocompleta con la TRM del día si lo dejás vacío" /></div>
          )}
          <div className="grid gap-2"><Label>Cuenta / de dónde sale</Label>
            <select name="account" value={account} onChange={(e) => setAccount(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="grid gap-2"><Label>Camino</Label>
            <select name="departure_id" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">(General)</option>
              {departures.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="grid gap-2"><Label>Reserva</Label>
            <select name="reservation_id" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">(Sin reserva)</option>
              {reservations.map((r: any) => <option key={r.id} value={r.id}>{r.type} · día {r.day_number ?? "—"} · {r.location ?? ""}</option>)}
            </select>
          </div>
          <div className="grid gap-2"><Label>Referencia</Label><Input name="reference" /></div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" rows={2} /></div>
          <DialogFooter>
            <Button type="submit" variant="accent">Registrar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
