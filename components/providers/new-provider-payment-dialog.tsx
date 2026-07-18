"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProviderPayment } from "@/lib/actions/reservations";
import { PAYMENT_METHODS, ACCOUNTS } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { Plus } from "lucide-react";

export function NewProviderPaymentDialog({ providerId, reservations, departures }: { providerId: string; reservations: any[]; departures: any[] }) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<"EUR" | "COP" | "USD">("EUR");
  const router = useRouter();
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
              <select name="method" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-2"><Label>Monto *</Label><Input name="amount" type="number" step="0.01" required /></div>
            <div className="grid gap-2"><Label>Divisa</Label>
              <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="EUR">EUR</option>
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          {currency === "COP" && (
            <div className="grid gap-2"><Label>TRM (COP por EUR)</Label><Input name="trm_eur_cop" type="number" step="0.01" placeholder="Se autocompleta con la TRM del día si lo dejás vacío" /></div>
          )}
          {currency === "USD" && (
            <div className="grid gap-2"><Label>Tasa USD→EUR (cuántos EUR vale 1 USD)</Label><Input name="usd_eur_rate" type="number" step="0.0001" placeholder="Ej. 0.92" required /></div>
          )}
          <div className="grid gap-2"><Label>Cuenta / de dónde sale</Label>
            <select name="account" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
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
