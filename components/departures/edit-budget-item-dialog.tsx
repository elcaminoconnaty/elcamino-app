"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateBudgetItem, deleteBudgetItem, payBudgetItem } from "@/lib/actions/budget";
import { BUDGET_CATEGORIES, BUDGET_STATUSES, PAYMENT_METHODS, ACCOUNTS } from "@/lib/constants";
import { SCALING_LABELS } from "@/lib/finance";
import { toast } from "@/components/ui/toaster";
import { Pencil, Trash2, CreditCard } from "lucide-react";

export function EditBudgetItemDialog({ item, providers, departureId, lockScaling }: { item: any; providers: any[]; departureId: string; lockScaling?: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scaling, setScaling] = useState<string>(item.scaling);
  const [status, setStatus] = useState<string>(item.status);
  const router = useRouter();

  // Registro del pago real cuando el item pasa a "pagado"
  const goingToPaid = status === "pagado" && item.status !== "pagado";
  const [registrarPago, setRegistrarPago] = useState(true);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState(
    String((Number(item.confirmed_unit_cost_eur ?? item.estimated_unit_cost_eur ?? 0) * Number(item.quantity ?? 1)).toFixed(2))
  );
  const [payCurrency, setPayCurrency] = useState<"EUR" | "COP" | "USD">("EUR");
  const [payTrm, setPayTrm] = useState("");
  const [payUsdRate, setPayUsdRate] = useState("");
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0]);
  const [payAccount, setPayAccount] = useState(ACCOUNTS[0]);

  async function onDelete() {
    if (!confirm("¿Eliminar este item?")) return;
    setDeleting(true);
    try {
      await deleteBudgetItem(item.id, departureId);
      toast({ title: "Item eliminado", variant: "success" });
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
          <DialogTitle>Editar item</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            const registraElPago = goingToPaid && registrarPago && !item.reservation_id;
            if (registraElPago) {
              if (!Number(payAmount) || Number(payAmount) <= 0) {
                toast({ title: "Monto del pago inválido", variant: "destructive" });
                return;
              }
              if (payCurrency === "USD" && (!Number(payUsdRate) || Number(payUsdRate) <= 0)) {
                toast({ title: "Falta la tasa USD→EUR", variant: "destructive" });
                return;
              }
            }
            setSaving(true);
            try {
              const payload: any = {
                category: fd.get("category"),
                description: fd.get("description"),
                quantity: Number(fd.get("quantity") || 1),
                unit: fd.get("unit")?.toString() || null,
                estimated_unit_cost_eur: Number(fd.get("estimated_unit_cost_eur") || 0),
                confirmed_unit_cost_eur: fd.get("confirmed_unit_cost_eur") ? Number(fd.get("confirmed_unit_cost_eur")) : null,
                provider_id: fd.get("provider_id")?.toString() || null,
                status,
                scaling: lockScaling ? item.scaling : scaling,
                item_date: fd.get("item_date")?.toString() || null,
                notes: fd.get("notes")?.toString() || null,
              };
              await updateBudgetItem(item.id, payload, departureId);
              if (registraElPago) {
                await payBudgetItem(item.id, {
                  paid_at: payDate,
                  amount: Number(payAmount),
                  currency: payCurrency,
                  trm_eur_cop: payCurrency === "COP" ? Number(payTrm) || null : null,
                  usd_eur_rate: payCurrency === "USD" ? Number(payUsdRate) || null : null,
                  method: payMethod,
                  account: payAccount,
                  notes: null,
                });
                toast({ title: "Guardado y pago registrado en gastos", variant: "success" });
              } else {
                toast({ title: "Guardado", variant: "success" });
              }
              setOpen(false);
              router.refresh();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
            setSaving(false);
          }}
          className="space-y-3"
        >
          {!lockScaling && (
            <div className="grid gap-2">
              <Label>Escala</Label>
              <select value={scaling} onChange={(e) => setScaling(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(SCALING_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">{SCALING_LABELS[scaling]?.description}</p>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Categoría</Label>
            <select name="category" defaultValue={item.category} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Descripción</Label>
            <Input name="description" defaultValue={item.description} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Fecha</Label><Input name="item_date" type="date" defaultValue={item.item_date ?? ""} /></div>
            <div className="grid gap-2"><Label>Estado</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {BUDGET_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {goingToPaid && item.reservation_id && (
            <div className="rounded-md border border-aviso-200 bg-aviso-50 p-3 text-xs text-aviso-900">
              Esta partida está vinculada a una <strong>reserva</strong>. El pago real se registra en la pestaña
              Reservas (botón "Pago"), para no contarlo dos veces. Acá solo se cambia el estado.
            </div>
          )}

          {goingToPaid && !item.reservation_id && (
            <div className="rounded-md border border-ok-200 bg-ok-50/60 p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="checkbox" checked={registrarPago} onChange={(e) => setRegistrarPago(e.target.checked)} />
                <CreditCard className="h-4 w-4" /> Registrar el pago real en gastos
              </label>
              {registrarPago ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="grid gap-1.5"><Label className="text-xs">Fecha</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
                    <div className="grid gap-1.5"><Label className="text-xs">Monto</Label><Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
                    <div className="grid gap-1.5"><Label className="text-xs">Divisa</Label>
                      <select value={payCurrency} onChange={(e) => setPayCurrency(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                        <option value="EUR">EUR</option><option value="COP">COP</option>
                      </select>
                    </div>
                  </div>
                  {payCurrency === "COP" && (
                    <div className="grid gap-1.5"><Label className="text-xs">TRM (COP por EUR)</Label><Input type="number" step="0.01" value={payTrm} onChange={(e) => setPayTrm(e.target.value)} placeholder="Vacío = TRM del día" /></div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-1.5"><Label className="text-xs">Método</Label>
                      <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                        {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="grid gap-1.5"><Label className="text-xs">Cuenta (de dónde sale)</Label>
                      <select value={payAccount} onChange={(e) => setPayAccount(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                        {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {item.provider_id
                      ? "Queda como pago al proveedor del item, conectado a gastos, saldos por cuenta y dashboard."
                      : "El item no tiene proveedor: queda como gasto operativo del camino, conectado a gastos y dashboard."}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">Solo se marca el estado, sin mover plata (usalo si el pago ya está registrado en gastos o en el proveedor).</p>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Cantidad</Label><Input name="quantity" type="number" step="0.01" defaultValue={item.quantity} /></div>
            <div className="grid gap-2"><Label>Unidad</Label><Input name="unit" defaultValue={item.unit ?? ""} placeholder="persona, cama, grupo, noche" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Costo estimado/u (EUR)</Label><Input name="estimated_unit_cost_eur" type="number" step="0.01" defaultValue={item.estimated_unit_cost_eur} /></div>
            <div className="grid gap-2"><Label>Costo confirmado/u (EUR)</Label><Input name="confirmed_unit_cost_eur" type="number" step="0.01" defaultValue={item.confirmed_unit_cost_eur ?? ""} /></div>
          </div>
          <div className="grid gap-2">
            <Label>Proveedor</Label>
            <select name="provider_id" defaultValue={item.provider_id ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">(sin proveedor)</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" defaultValue={item.notes ?? ""} rows={2} /></div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button type="button" variant="destructive" size="sm" onClick={onDelete} disabled={deleting}>
              <Trash2 className="h-4 w-4" /> {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="accent" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
