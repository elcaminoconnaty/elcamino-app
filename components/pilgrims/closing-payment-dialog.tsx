"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { registerClosingPayment, registerRefund } from "@/lib/actions/settlement";
import { getTrmForDate } from "@/lib/actions/payments";
import { PAYMENT_METHODS, ACCOUNTS, GLOBAL66 } from "@/lib/constants";
import { formatEUR, formatCOP } from "@/lib/utils";
import { copRedondeado, type PilgrimSettlement } from "@/lib/settlement";
import { toast } from "@/components/ui/toaster";
import { CheckCircle2, Undo2 } from "lucide-react";

/**
 * Registra el último movimiento del viaje: el pago de cierre de quien todavía
 * debe, o la devolución de quien pagó de más al recalcular a la tasa de cierre.
 *
 * El monto viene precalculado desde la liquidación y es editable, porque en la
 * práctica Naty redondea o acuerda un ajuste con el peregrino.
 */
export function ClosingPaymentDialog({
  settlement,
  modo,
  trigger,
}: {
  settlement: PilgrimSettlement;
  modo: "cierre" | "devolucion";
  trigger?: React.ReactNode;
}) {
  const esDevolucion = modo === "devolucion";
  // Con recálculo hay tasa de cierre y el monto se expresa en pesos con ella.
  // Sin recálculo no hay tasa fija: el monto va en euros, o en pesos con la TRM
  // del día si Naty prefiere cobrarlo así.
  const trmCierre = Number(settlement.settlement_trm ?? 0);
  const conRecalculo = settlement.settlement_mode === "recalculo" && trmCierre > 0;
  const eurSugerido = esDevolucion ? settlement.por_devolver_eur : settlement.por_cobrar_eur;
  const copSugerido = conRecalculo ? copRedondeado(eurSugerido, trmCierre) : 0;

  const [open, setOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<"EUR" | "COP">(conRecalculo ? "COP" : "EUR");
  const [amount, setAmount] = useState(String(conRecalculo ? copSugerido : eurSugerido.toFixed(2)));
  // TRM del día, solo para el modo sin recálculo.
  const [trmDia, setTrmDia] = useState("");
  const [method, setMethod] = useState(PAYMENT_METHODS[2] ?? PAYMENT_METHODS[0]);
  const [account, setAccount] = useState(ACCOUNTS[2] ?? ACCOUNTS[0]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open || conRecalculo || currency !== "COP" || trmDia) return;
    getTrmForDate(paidAt).then((r) => { if (r) setTrmDia(String(r)); });
  }, [open, conRecalculo, currency, paidAt, trmDia]);

  // Con recálculo, el monto ya está expresado a la tasa de cierre, así que el
  // pago usa esa misma tasa y no la del día: es la que se le prometió. Sin
  // recálculo se usa la TRM del día como cualquier otro pago.
  const trmAplicada = conRecalculo ? trmCierre : Number(trmDia) || 0;
  const trmDelMovimiento = currency === "COP" ? trmAplicada || null : null;
  const montoNum = Number(amount) || 0;
  const eurEquivalente = currency === "COP" ? (trmAplicada > 0 ? montoNum / trmAplicada : 0) : montoNum;
  const saldoRestante = esDevolucion
    ? settlement.por_devolver_eur - eurEquivalente
    : settlement.por_cobrar_eur - eurEquivalente;

  function onCurrencyChange(c: "EUR" | "COP") {
    setCurrency(c);
    if (c === "EUR") {
      setAmount(eurSugerido.toFixed(2));
      return;
    }
    const tasa = conRecalculo ? trmCierre : Number(trmDia) || 0;
    setAmount(tasa > 0 ? String(copRedondeado(eurSugerido, tasa)) : "");
  }

  function onMethodChange(m: string) {
    setMethod(m);
    if (m === GLOBAL66) setAccount(GLOBAL66);
  }

  async function submit() {
    setSaving(true);
    try {
      if (currency === "COP" && trmAplicada <= 0) {
        throw new Error(
          conRecalculo
            ? "Falta fijar la tasa de cierre de la salida."
            : `No hay TRM cargada para ${paidAt}. Escribila a mano o cargala en /trm.`
        );
      }
      const payload = {
        registration_id: settlement.registration_id,
        paid_at: paidAt,
        amount: montoNum,
        currency,
        trm_eur_cop: trmDelMovimiento,
        method,
        account,
        reference: reference || null,
        notes: notes || null,
      };
      if (esDevolucion) {
        await registerRefund(payload);
        toast({ title: "Devolución registrada", variant: "success" });
      } else {
        await registerClosingPayment(payload);
        toast({ title: "Pago de cierre registrado", variant: "success" });
      }
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
        {trigger ?? (
          <Button variant="accent" size="sm">
            {esDevolucion ? <Undo2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {esDevolucion ? "Registrar devolución" : "Registrar pago de cierre"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{esDevolucion ? "Devolución a" : "Pago de cierre de"} {settlement.pilgrim_name}</DialogTitle>
          <DialogDescription>
            {esDevolucion
              ? conRecalculo
                ? "Pagó de más al recalcular sus abonos a la tasa de cierre. Esto registra el giro de vuelta, que sale de la cuenta que elijas."
                : "Pagó más de lo acordado. Esto registra el giro de vuelta, que sale de la cuenta que elijas."
              : conRecalculo
                ? "Último pago del viaje, ya calculado con los abonos anteriores re-valorados a la tasa de cierre."
                : "Último pago del viaje: lo acordado menos lo que ya abonó."}
          </DialogDescription>
        </DialogHeader>

        {/* Cómo se llegó a este monto */}
        <div className="rounded-md border border-camino-yellow bg-cream-50 p-3 space-y-1 text-sm">
          <Fila label="Total del viaje" value={formatEUR(settlement.net_total_eur)} />
          <Fila
            label={conRecalculo ? "Abonos re-valorados a la tasa de cierre" : "Ya abonado"}
            value={formatEUR(conRecalculo ? settlement.paid_eur_cierre : settlement.paid_eur_historico)}
            sub={
              conRecalculo && settlement.cop_revalorado > 0
                ? `${formatCOP(settlement.cop_revalorado)} ÷ ${trmCierre.toLocaleString("es-CO")}${settlement.eur_fijo > 0 ? ` + ${formatEUR(settlement.eur_fijo)} ya en euros` : ""}`
                : undefined
            }
          />
          <div className="flex justify-between pt-1.5 border-t font-medium">
            <span>{esDevolucion ? "A favor del peregrino" : "Falta por pagar"}</span>
            <span className={esDevolucion ? "text-blue-800" : "text-amber-800"}>
              {formatEUR(eurSugerido)}
              {conRecalculo && <span className="text-xs text-muted-foreground ml-1">· {formatCOP(copSugerido)}</span>}
            </span>
          </div>
        </div>

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
            <div className="grid gap-2">
              <Label>{esDevolucion ? "Monto a devolver *" : "Monto *"}</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="grid gap-2"><Label>Divisa</Label>
              <select value={currency} onChange={(e) => onCurrencyChange(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="COP">COP</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {currency === "COP" && conRecalculo && (
            <p className="text-xs text-muted-foreground">
              Se registra con la tasa de cierre de {trmCierre.toLocaleString("es-CO")} COP/EUR — la misma que se le
              prometió — no con la TRM de hoy. Equivale a <strong>{formatEUR(eurEquivalente)}</strong>.
            </p>
          )}
          {currency === "COP" && !conRecalculo && (
            <div className="grid gap-2">
              <Label>TRM EUR/COP del día</Label>
              <Input type="number" step="0.01" value={trmDia} onChange={(e) => setTrmDia(e.target.value)} placeholder="3900.00" />
              {trmAplicada > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Este camino liquida sin recálculo, así que el pago se convierte con la TRM del día. Equivale a{" "}
                  <strong>{formatEUR(eurEquivalente)}</strong>.
                </p>
              ) : (
                <p className="text-xs text-amber-700">No hay TRM cargada para {paidAt}. Escribila a mano o cargala en /trm.</p>
              )}
            </div>
          )}

          {Math.abs(saldoRestante) > 0.5 && (
            <p className={`text-xs rounded-md p-2 ${saldoRestante > 0 ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-blue-900"}`}>
              {saldoRestante > 0
                ? `Con este monto quedarían ${formatEUR(saldoRestante)} sin ${esDevolucion ? "devolver" : "cobrar"}.`
                : `Este monto excede en ${formatEUR(-saldoRestante)} lo que ${esDevolucion ? "hay a favor" : "falta por cobrar"}.`}
            </p>
          )}

          <div className="grid gap-2">
            <Label>{esDevolucion ? "Cuenta de donde sale la plata" : "Cuenta / dónde entra la plata"}</Label>
            <select value={account} onChange={(e) => setAccount(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="grid gap-2"><Label>Referencia</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° de transacción, comprobante" /></div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="accent" onClick={submit} disabled={saving}>
            {saving ? "Guardando..." : esDevolucion ? "Registrar devolución" : "Registrar pago de cierre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Fila({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground min-w-0">
        {label}
        {sub && <span className="block text-[11px] leading-tight">{sub}</span>}
      </span>
      <span className="shrink-0">{value}</span>
    </div>
  );
}
