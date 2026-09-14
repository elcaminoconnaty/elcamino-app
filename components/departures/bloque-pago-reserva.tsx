"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { CamposCuenta } from "@/components/providers/campos-cuenta";
import { createProviderAccount, listProviderAccounts } from "@/lib/actions/provider-accounts";
import { ACCOUNTS, RESERVATION_PAYMENT_METHODS } from "@/lib/constants";
import { formatearIban } from "@/lib/banco";
import { Plus, AlertTriangle } from "lucide-react";

const LABEL = new Map(RESERVATION_PAYMENT_METHODS.map((m) => [m.value, m.label]));

export type ValoresPago = {
  payment_account_id: string | null;
  payment_method: string | null;
  pay_from_account: string | null;
  payment_terms: string | null;
  payment_reference: string | null;
};

function resumen(c: any): string {
  const detalle =
    c.method === "transferencia" ? formatearIban(c.iban) :
    c.method === "bizum" ? c.bizum_phone :
    c.account_holder;
  return [c.alias || LABEL.get(c.method) || c.method, detalle].filter(Boolean).join(" · ");
}

/**
 * Cómo se paga ESTA reserva: la negociación cambia camino a camino, así que el medio y
 * la cuenta del proveedor se eligen acá y no se heredan a ciegas de su ficha.
 *
 * Es lo que alimenta el informe de pagos a proveedores, por eso insiste cuando falta
 * a dónde girar: una reserva sin cuenta es una fila del informe que Naty no puede pagar.
 */
export function BloquePagoReserva({
  providerId,
  valores,
  onChange,
}: {
  providerId: string | null;
  valores: ValoresPago;
  onChange: (v: ValoresPago) => void;
}) {
  const [cuentas, setCuentas] = React.useState<any[]>([]);
  const [cargando, setCargando] = React.useState(false);
  const [abrirNueva, setAbrirNueva] = React.useState(false);
  const [guardandoCuenta, setGuardandoCuenta] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    if (!providerId) { setCuentas([]); return; }
    setCargando(true);
    listProviderAccounts(providerId)
      .then((cs) => { if (vivo) setCuentas(cs); })
      .catch(() => { if (vivo) setCuentas([]); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [providerId]);

  const set = (p: Partial<ValoresPago>) => onChange({ ...valores, ...p });
  const cuenta = cuentas.find((c) => c.id === valores.payment_account_id) ?? null;
  const predeterminada = cuentas.find((c) => c.is_default) ?? null;

  // Elegir la cuenta fija el medio: es el medio de esa cuenta, no otro.
  function elegirCuenta(id: string) {
    const c = cuentas.find((x) => x.id === id);
    set({ payment_account_id: id || null, payment_method: c?.method ?? valores.payment_method });
  }

  const sinCuenta = !valores.payment_account_id && !predeterminada;

  return (
    <div className="rounded-md border bg-alba/60 p-3 space-y-3">
      <div className="text-xs uppercase tracking-widest text-ocre-profundo">Cómo se paga esta reserva</div>

      <div className="grid gap-2">
        <Label className="text-xs">Cuenta del proveedor (a dónde se gira)</Label>
        <div className="flex gap-2">
          <select
            value={valores.payment_account_id ?? ""}
            onChange={(e) => elegirCuenta(e.target.value)}
            disabled={!providerId || cargando}
            className="h-10 flex-1 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">
              {!providerId ? "Elegí primero el proveedor" : predeterminada ? `La de siempre · ${resumen(predeterminada)}` : "Sin cuenta cargada"}
            </option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{resumen(c)}</option>)}
          </select>
          <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" disabled={!providerId} onClick={() => setAbrirNueva(true)}>
            <Plus className="h-4 w-4" /> Otra cuenta
          </Button>
        </div>
        {sinCuenta && providerId && !cargando && (
          <p className="text-[11px] text-error-700 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Este proveedor no tiene a dónde girar. Cargale una cuenta o la reserva sale incompleta en el informe.
          </p>
        )}
        {cuenta?.currency && cuenta.currency !== "EUR" && (
          <p className="text-[11px] text-aviso-800">Esta cuenta cobra en {cuenta.currency}: el informe lo separa del resto.</p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Medio de pago</Label>
          <select
            value={valores.payment_method ?? ""}
            onChange={(e) => set({ payment_method: e.target.value || null })}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{predeterminada ? `Como siempre (${LABEL.get(predeterminada.method)})` : "Sin definir"}</option>
            {RESERVATION_PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Desde qué cuenta nuestra sale</Label>
          <select
            value={valores.pay_from_account ?? ""}
            onChange={(e) => set({ pay_from_account: e.target.value || null })}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Sin definir</option>
            {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Condición pactada</Label>
          <Input
            value={valores.payment_terms ?? ""}
            onChange={(e) => set({ payment_terms: e.target.value || null })}
            placeholder="30% al reservar, resto 7 días antes"
          />
        </div>
        <div>
          <Label className="text-xs">Concepto de la transferencia</Label>
          <Input
            value={valores.payment_reference ?? ""}
            onChange={(e) => set({ payment_reference: e.target.value || null })}
            placeholder="Grupo El Camino con Naty · Sep 2026"
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Las fechas y los montos de cada cuota van en el plan de pagos, más abajo. Todo esto sale en el informe de pagos a proveedores.
      </p>

      <Dialog open={abrirNueva} onOpenChange={setAbrirNueva}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nueva cuenta de este proveedor</DialogTitle></DialogHeader>
          <form
            action={async (fd) => {
              if (!providerId) return;
              setGuardandoCuenta(true);
              try {
                const creada: any = await createProviderAccount(providerId, fd);
                setCuentas((cs) => [...cs, creada]);
                set({ payment_account_id: creada.id, payment_method: creada.method });
                toast({ title: "Cuenta creada y asignada a esta reserva", variant: "success" });
                setAbrirNueva(false);
              } catch (e: any) {
                toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
              } finally {
                setGuardandoCuenta(false);
              }
            }}
            className="space-y-3 max-h-[70vh] overflow-y-auto pr-1"
          >
            <CamposCuenta />
            <DialogFooter>
              <Button type="submit" variant="accent" disabled={guardandoCuenta}>{guardandoCuenta ? "Guardando…" : "Guardar y usar acá"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
