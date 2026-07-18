"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProviderPayment, deleteProviderPayment } from "@/lib/actions/reservations";
import { getReservationPayments } from "@/lib/actions/provider-payments";
import { getReservationSchedule, markScheduleItemPaid } from "@/lib/actions/reservation-schedule";
import { getTrmForDate } from "@/lib/actions/payments";
import { PAYMENT_METHODS, ACCOUNTS } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { formatEUR, formatDate } from "@/lib/utils";
import { CreditCard, Trash2, Calendar } from "lucide-react";

type Reservation = {
  id: string;
  provider_id: string;
  departure_id: string;
  estimated_cost_eur: number | null;
  confirmed_cost_eur: number | null;
  providers?: { name?: string } | null;
};

export function RegisterReservationPayment({ reservation }: { reservation: Reservation }) {
  const [open, setOpen] = useState(false);
  const [payments, setPayments] = useState<any[] | null>(null);
  const [schedule, setSchedule] = useState<any[] | null>(null);
  const [currency, setCurrency] = useState<"EUR" | "COP" | "USD">("EUR");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [trm, setTrm] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const router = useRouter();

  const cost = Number(reservation.confirmed_cost_eur ?? reservation.estimated_cost_eur ?? 0);
  const paid = (payments ?? []).reduce((s, p) => s + Number(p.amount_eur || 0), 0);
  const pct = cost > 0 ? Math.min(100, Math.round((paid / cost) * 1000) / 10) : 0;
  const saldo = Math.max(0, cost - paid);

  useEffect(() => {
    if (open && payments === null) {
      getReservationPayments(reservation.id).then((data) => setPayments(data ?? []));
    }
    if (open && schedule === null) {
      getReservationSchedule(reservation.id).then((data) => setSchedule(data ?? []));
    }
    if (!open) { setPayments(null); setSchedule(null); setSelectedScheduleId(""); }
  }, [open, reservation.id, payments, schedule]);

  useEffect(() => {
    if (currency === "COP" && open) {
      getTrmForDate(date).then((r) => r && setTrm(String(r)));
    }
  }, [currency, date, open]);

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar este pago?")) return;
    try {
      await deleteProviderPayment(id);
      setPayments((prev) => (prev ?? []).filter((p) => p.id !== id));
      toast({ title: "Pago eliminado", variant: "success" });
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CreditCard className="h-3.5 w-3.5" /> Pago
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pagos — {reservation.providers?.name ?? "Reserva"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 grid-cols-3 text-sm">
          <div className="rounded-md border bg-cream-50 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Costo</div>
            <div className="font-semibold">{formatEUR(cost)}</div>
          </div>
          <div className="rounded-md border bg-green-50 border-green-200 p-3">
            <div className="text-[10px] uppercase tracking-wider text-green-900">Pagado ({pct}%)</div>
            <div className="font-semibold text-green-900">{formatEUR(paid)}</div>
          </div>
          <div className={`rounded-md border p-3 ${saldo > 0 ? "bg-amber-50 border-amber-200" : "bg-cream-50"}`}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo</div>
            <div className="font-semibold">{formatEUR(saldo)}</div>
          </div>
        </div>

        <div className="h-2 bg-cream-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
        </div>

        {payments && payments.length > 0 && (
          <div className="border rounded-md max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-cream-50 text-muted-foreground">
                <tr><th className="text-left p-2">Fecha</th><th className="text-left p-2">Cuenta</th><th className="text-right p-2">Monto</th><th className="text-right p-2">EUR</th><th></th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{formatDate(p.paid_at)}</td>
                    <td className="p-2 text-muted-foreground">{p.account ?? "—"}</td>
                    <td className="p-2 text-right">{Number(p.amount).toLocaleString("es-CO")} {p.currency}</td>
                    <td className="p-2 text-right">{formatEUR(p.amount_eur)}</td>
                    <td className="p-2"><button type="button" onClick={() => onDelete(p.id)} className="text-red-700 hover:text-red-900"><Trash2 className="h-3 w-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {schedule && schedule.length > 0 && (
          <div className="border rounded-md p-3 bg-cream-50 space-y-1.5">
            <div className="text-xs font-medium flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Plan de pagos</div>
            <div className="space-y-1">
              {schedule.map((s) => (
                <div key={s.id} className={`flex items-center justify-between text-xs gap-2 p-1.5 rounded ${s.paid ? "bg-green-50 text-green-900" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{formatDate(s.due_date)}</span>
                    {s.label && <span className="text-muted-foreground ml-1.5">· {s.label}</span>}
                  </div>
                  <div className="font-semibold whitespace-nowrap">{formatEUR(s.amount_eur)}</div>
                  <div className="w-20 text-right">
                    {s.paid ? (
                      <span className="text-green-700 text-[10px]">✓ pagada</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setSelectedScheduleId(s.id); (document.getElementById("res-pay-amount") as HTMLInputElement).value = String(s.amount_eur); }}
                        className="text-camino-deepYellow hover:underline text-[10px]"
                      >
                        usar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {selectedScheduleId && (
              <div className="text-[10px] text-amber-700 mt-1">→ El pago quedará asociado a la cuota seleccionada y se marcará pagada.</div>
            )}
          </div>
        )}

        <form
          action={async (fd) => {
            try {
              fd.set("provider_id", reservation.provider_id);
              fd.set("reservation_id", reservation.id);
              fd.set("departure_id", reservation.departure_id);
              await createProviderPayment(fd);
              // Si se seleccionó una cuota, marcarla pagada
              if (selectedScheduleId) {
                // Buscar el último pago insertado para asociar
                const latest = await getReservationPayments(reservation.id);
                const lastPayment = latest && latest.length > 0 ? latest[latest.length - 1] : null;
                if (lastPayment) {
                  await markScheduleItemPaid(
                    selectedScheduleId,
                    lastPayment.id,
                    fd.get("paid_at")?.toString() || new Date().toISOString().slice(0,10),
                    reservation.departure_id
                  );
                }
                const updatedSched = await getReservationSchedule(reservation.id);
                setSchedule(updatedSched ?? []);
                setSelectedScheduleId("");
              }
              toast({ title: "Pago registrado", variant: "success" });
              const updated = await getReservationPayments(reservation.id);
              setPayments(updated ?? []);
              router.refresh();
              (document.getElementById("res-pay-form") as HTMLFormElement)?.reset();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
          }}
          id="res-pay-form"
          className="space-y-3 border-t pt-3"
        >
          <div className="text-sm font-medium">Nuevo pago</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5"><Label className="text-xs">Fecha</Label><Input name="paid_at" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
            <div className="grid gap-1.5 sm:col-span-2"><Label className="text-xs">Monto</Label>
              <div className="flex gap-2">
                <Input id="res-pay-amount" name="amount" type="number" step="0.01" required defaultValue={saldo > 0 ? saldo.toFixed(2) : ""} />
                <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="EUR">EUR</option>
                  <option value="COP">COP</option>
                </select>
              </div>
            </div>
          </div>
          {currency === "COP" && (
            <div className="grid gap-1.5"><Label className="text-xs">TRM (COP por EUR)</Label><Input name="trm_eur_cop" type="number" step="0.01" value={trm} onChange={(e) => setTrm(e.target.value)} /></div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label className="text-xs">Método</Label>
              <select name="method" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5"><Label className="text-xs">Cuenta (de dónde sale)</Label>
              <select name="account" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5"><Label className="text-xs">Referencia (nº transferencia, comprobante)</Label><Input name="reference" /></div>
          <div className="grid gap-1.5"><Label className="text-xs">Notas</Label><Textarea name="notes" rows={2} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cerrar</Button>
            <Button type="submit" variant="accent">Registrar pago</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
