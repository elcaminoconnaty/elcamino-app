"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RESERVATION_PAYMENT_METHODS, PROVIDER_CURRENCIES } from "@/lib/constants";
import { formatearIban, validarIban, validarSwift } from "@/lib/banco";

/**
 * Los campos de una cuenta de cobro. Los comparten la ficha del proveedor y el atajo
 * de "crear cuenta nueva" desde la reserva, para que sea el mismo formulario en los dos
 * lados y no se pida un dato en uno y en el otro no.
 *
 * Se muestra solo lo que el medio necesita: pedirle el IBAN a un Bizum es ruido, y
 * dejar el IBAN vacío en una transferencia es una transferencia que no se puede hacer.
 */
export function CamposCuenta({ cuenta }: { cuenta?: any }) {
  const [method, setMethod] = React.useState<string>(cuenta?.method ?? "transferencia");
  const [currency, setCurrency] = React.useState<string>(cuenta?.currency ?? "EUR");
  const [iban, setIban] = React.useState<string>(formatearIban(cuenta?.iban));
  const [swift, setSwift] = React.useState<string>(cuenta?.swift_bic ?? "");

  const errIban = validarIban(iban);
  const errSwift = validarSwift(swift);
  const esTransferencia = method === "transferencia";
  const esBizum = method === "bizum";

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Nombre de la cuenta</Label>
          <Input name="alias" defaultValue={cuenta?.alias ?? ""} placeholder="Cuenta habitual / Bizum del dueño" />
        </div>
        <div className="grid gap-2">
          <Label>Medio de pago</Label>
          <select name="method" value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {RESERVATION_PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {esTransferencia && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Titular *</Label><Input name="account_holder" defaultValue={cuenta?.account_holder ?? ""} placeholder="Como figura en el banco" required /></div>
            <div className="grid gap-2"><Label>NIF del titular</Label><Input name="tax_id" defaultValue={cuenta?.tax_id ?? ""} placeholder="B12345678 · 12345678Z" /></div>
          </div>
          <div className="grid gap-2"><Label>Banco</Label><Input name="bank_name" defaultValue={cuenta?.bank_name ?? ""} placeholder="Abanca, Santander…" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>IBAN *</Label>
              <Input name="iban" value={iban} onChange={(e) => setIban(formatearIban(e.target.value))} placeholder="ES91 2100 0418 4502 0005 1332" required />
              {iban && errIban && <p className="text-[11px] text-error-700">{errIban}</p>}
              {iban && !errIban && <p className="text-[11px] text-ok-700">IBAN válido.</p>}
            </div>
            <div className="grid gap-2">
              <Label>SWIFT / BIC</Label>
              <Input name="swift_bic" value={swift} onChange={(e) => setSwift(e.target.value.toUpperCase())} placeholder="CAGLESMMXXX" />
              {swift && errSwift && <p className="text-[11px] text-error-700">{errSwift}</p>}
            </div>
          </div>
        </>
      )}

      {esBizum && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Teléfono Bizum *</Label><Input name="bizum_phone" defaultValue={cuenta?.bizum_phone ?? ""} placeholder="+34 600 00 00 00" required /></div>
            <div className="grid gap-2"><Label>A nombre de</Label><Input name="account_holder" defaultValue={cuenta?.account_holder ?? ""} /></div>
          </div>
          <div className="grid gap-2"><Label>NIF</Label><Input name="tax_id" defaultValue={cuenta?.tax_id ?? ""} placeholder="B12345678 · 12345678Z" /></div>
        </>
      )}

      {!esTransferencia && !esBizum && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2"><Label>A nombre de / referencia</Label><Input name="account_holder" defaultValue={cuenta?.account_holder ?? ""} placeholder="Ej.: se paga en el mostrador al llegar" /></div>
          <div className="grid gap-2"><Label>NIF</Label><Input name="tax_id" defaultValue={cuenta?.tax_id ?? ""} placeholder="Para la factura" /></div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Moneda en la que cobra</Label>
          <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {PROVIDER_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {currency !== "EUR" && (
          <div className="grid gap-2">
            <Label>{currency} por 1 EUR</Label>
            <Input name="fx_per_eur" type="number" step="0.0001" defaultValue={cuenta?.fx_per_eur ?? ""} placeholder="Ej. 0.85" />
            <p className="text-[11px] text-muted-foreground">Para que el informe muestre el importe a girar en {currency}.</p>
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <Label>Notas de pago</Label>
        <Textarea name="notes" rows={2} defaultValue={cuenta?.notes ?? ""} placeholder="Ej.: mandar comprobante a reservas@hotel.com; el concepto debe llevar el nombre del grupo." />
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" name="is_default" defaultChecked={cuenta?.is_default ?? false} />
        Usar esta cuenta por defecto en las reservas nuevas de este proveedor
      </label>
    </div>
  );
}

/** Una línea legible de la cuenta, para listas y selectores. */
export function resumenCuenta(c: any): string {
  if (!c) return "—";
  const medio = RESERVATION_PAYMENT_METHODS.find((m) => m.value === c.method)?.label ?? c.method;
  const detalle = c.method === "transferencia"
    ? formatearIban(c.iban)
    : c.method === "bizum"
      ? c.bizum_phone
      : c.account_holder;
  return [c.alias || medio, detalle].filter(Boolean).join(" · ");
}
