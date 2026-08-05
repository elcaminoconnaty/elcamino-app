"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createExpense } from "@/lib/actions/expenses";
import { createProviderPayment } from "@/lib/actions/reservations";
import { getTrmForDate } from "@/lib/actions/payments";
import {
  PAYMENT_METHODS,
  ACCOUNTS,
  GLOBAL66,
  EXPENSE_CATEGORIES_OPERATIVO,
  EXPENSE_CATEGORIES_PERSONAL,
} from "@/lib/constants";
import { Global66Fields } from "@/components/ui/global66-fields";
import { toast } from "@/components/ui/toaster";
import { Plus } from "lucide-react";

type Kind = "operativo" | "personal" | "pago_proveedor";

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "operativo", label: "Operativo (gasto del negocio)" },
  { value: "pago_proveedor", label: "Pago a proveedor" },
  { value: "personal", label: "Personal (Naty)" },
];

export function NewExpenseDialog({
  departures,
  providers = [],
  reservations = [],
  budgetItems = [],
  defaultDepartureId,
}: {
  departures: any[];
  providers?: any[];
  reservations?: any[];
  budgetItems?: any[];
  defaultDepartureId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("operativo");
  const [currency, setCurrency] = useState<"EUR" | "COP" | "USD">("EUR");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [trm, setTrm] = useState("");
  const [departureId, setDepartureId] = useState(defaultDepartureId ?? "");
  const [providerId, setProviderId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [account, setAccount] = useState(ACCOUNTS[0]);
  const [eurSent, setEurSent] = useState("");
  const router = useRouter();
  const cats = kind === "personal" ? EXPENSE_CATEGORIES_PERSONAL : EXPENSE_CATEGORIES_OPERATIVO;

  // Con Global 66 se debita COP y sale en euros a la tasa de Global 66.
  const conversionGlobal66 = method === GLOBAL66 && currency === "COP";

  function onMethodChange(m: string) {
    setMethod(m);
    if (m === GLOBAL66) setAccount(GLOBAL66);
  }

  useEffect(() => {
    if (currency === "COP" && open) {
      getTrmForDate(date).then((r) => r && setTrm(String(r)));
    }
  }, [currency, date, open]);

  // Proveedores del viaje seleccionado primero (los que tienen reserva en ese camino)
  const providerIdsDelViaje = useMemo(() => {
    if (!departureId) return new Set<string>();
    return new Set(
      reservations
        .filter((r) => r.departure_id === departureId && r.provider_id)
        .map((r) => r.provider_id as string)
    );
  }, [departureId, reservations]);

  const orderedProviders = useMemo(() => {
    const list = [...providers];
    list.sort((a, b) => {
      const av = providerIdsDelViaje.has(a.id) ? 0 : 1;
      const bv = providerIdsDelViaje.has(b.id) ? 0 : 1;
      if (av !== bv) return av - bv;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    return list;
  }, [providers, providerIdsDelViaje]);

  // Reservas del proveedor + camino elegidos
  const reservasFiltradas = useMemo(
    () =>
      reservations.filter(
        (r) =>
          (!departureId || r.departure_id === departureId) &&
          (!providerId || r.provider_id === providerId)
      ),
    [reservations, departureId, providerId]
  );

  // Ítems del presupuesto no pagados del camino elegido (para vincular un gasto operativo)
  const itemsDelCamino = useMemo(
    () => budgetItems.filter((b) => b.departure_id === departureId),
    [budgetItems, departureId]
  );

  const esPagoProveedor = kind === "pago_proveedor";

  async function onSubmit(fd: FormData) {
    try {
      if (esPagoProveedor) {
        if (!fd.get("provider_id")) throw new Error("Elegí el proveedor.");
        await createProviderPayment(fd);
        toast({ title: "Pago a proveedor registrado", variant: "success" });
      } else {
        await createExpense(fd);
        toast({ title: "Gasto registrado", variant: "success" });
      }
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> Nuevo movimiento</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo movimiento</DialogTitle></DialogHeader>
        <form action={onSubmit} className="space-y-3">
          {/* provider_payment usa paid_at; expenses usa expense_date → mando ambos */}
          <input type="hidden" name="paid_at" value={date} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Fecha</Label><Input name="expense_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Tipo</Label>
              <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              {!esPagoProveedor && <input type="hidden" name="kind" value={kind} />}
            </div>
          </div>

          {/* Camino: relevante para operativo y pago a proveedor */}
          {kind !== "personal" && (
            <div className="grid gap-2"><Label>Camino {esPagoProveedor ? "" : "(opcional)"}</Label>
              <select name="departure_id" value={departureId} onChange={(e) => setDepartureId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">(General)</option>
                {departures.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          {esPagoProveedor && (
            <>
              <div className="grid gap-2"><Label>Proveedor *</Label>
                <select name="provider_id" value={providerId} onChange={(e) => setProviderId(e.target.value)} required className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Elegí un proveedor…</option>
                  {departureId && providerIdsDelViaje.size > 0 && (
                    <optgroup label="Proveedores de este camino">
                      {orderedProviders.filter((p) => providerIdsDelViaje.has(p.id)).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.type ? ` · ${p.type}` : ""}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={departureId ? "Otros proveedores" : "Todos los proveedores"}>
                    {orderedProviders.filter((p) => !providerIdsDelViaje.has(p.id)).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.type ? ` · ${p.type}` : ""}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className="grid gap-2"><Label>Reserva (opcional — para descontar del saldo)</Label>
                <select name="reservation_id" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Sin reserva puntual</option>
                  {reservasFiltradas.map((r) => (
                    <option key={r.id} value={r.id}>{r.type}{r.location ? ` · ${r.location}` : ""} ({r.status})</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {!esPagoProveedor && (
            <div className="grid gap-2"><Label>Categoría</Label>
              <select name="category" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Vínculo opcional a un ítem del presupuesto (gasto operativo de un camino) */}
          {kind === "operativo" && departureId && itemsDelCamino.length > 0 && (
            <div className="grid gap-2"><Label>Ítem del presupuesto (opcional — lo marca como cubierto)</Label>
              <select name="budget_item_id" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Sin vincular</option>
                {itemsDelCamino.map((b) => (
                  <option key={b.id} value={b.id}>{b.description}{b.status === "pagado" ? " (ya pagado)" : ""}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-2"><Label>Descripción</Label><Input name="description" placeholder={esPagoProveedor ? "Abono, factura #, etc." : "Marketing Instagram, mercado del mes, etc."} /></div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-2"><Label>Monto *</Label><Input name="amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
            <div className="grid gap-2"><Label>Divisa</Label>
              <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="EUR">EUR</option>
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          {conversionGlobal66 && (
            <Global66Fields
              amountCop={Number(amount)}
              eur={eurSent}
              onEurChange={setEurSent}
              marketTrm={Number(trm) || null}
              direction="out"
              trmInputName="trm_eur_cop"
            />
          )}
          {currency === "COP" && !conversionGlobal66 && (
            <div className="grid gap-2"><Label>TRM (autocompletado)</Label><Input name="trm_eur_cop" type="number" step="0.01" value={trm} onChange={(e) => setTrm(e.target.value)} /></div>
          )}
          {currency === "USD" && (
            <div className="grid gap-2"><Label>Tasa USD→EUR *</Label><Input name="usd_eur_rate" type="number" step="0.0001" placeholder="0.92" /></div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Método de pago</Label>
              <select name={esPagoProveedor ? "method" : "payment_method"} value={method} onChange={(e) => onMethodChange(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="grid gap-2"><Label>Cuenta / de dónde sale</Label>
              <select name="account" value={account} onChange={(e) => setAccount(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" rows={2} /></div>
          <DialogFooter>
            <Button type="submit" variant="accent">Registrar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
