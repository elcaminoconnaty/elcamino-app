"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { CamposCuenta } from "@/components/providers/campos-cuenta";
import { createProviderAccount, updateProviderAccount, archiveProviderAccount } from "@/lib/actions/provider-accounts";
import { RESERVATION_PAYMENT_METHODS } from "@/lib/constants";
import { formatearIban } from "@/lib/banco";
import { Plus, Pencil, Archive, Star } from "lucide-react";

const LABEL = new Map(RESERVATION_PAYMENT_METHODS.map((m) => [m.value, m.label]));

function Detalle({ c }: { c: any }) {
  const lineas: string[] = [];
  if (c.method === "transferencia") {
    if (c.account_holder) lineas.push(`Titular: ${c.account_holder}`);
    if (c.tax_id) lineas.push(`NIF: ${c.tax_id}`);
    if (c.bank_name) lineas.push(`Banco: ${c.bank_name}`);
    if (c.iban) lineas.push(`IBAN: ${formatearIban(c.iban)}`);
    if (c.swift_bic) lineas.push(`SWIFT: ${c.swift_bic}`);
  } else if (c.method === "bizum") {
    if (c.bizum_phone) lineas.push(`Bizum: ${c.bizum_phone}`);
    if (c.account_holder) lineas.push(`A nombre de: ${c.account_holder}`);
    if (c.tax_id) lineas.push(`NIF: ${c.tax_id}`);
  } else {
    if (c.account_holder) lineas.push(c.account_holder);
    if (c.tax_id) lineas.push(`NIF: ${c.tax_id}`);
  }
  if (c.currency && c.currency !== "EUR") lineas.push(`Cobra en ${c.currency}${c.fx_per_eur ? ` · ${c.fx_per_eur} ${c.currency}/EUR` : ""}`);
  if (c.notes) lineas.push(c.notes);
  return (
    <div className="text-xs text-muted-foreground space-y-0.5">
      {lineas.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}

function FormularioCuenta({
  providerId,
  cuenta,
  trigger,
}: {
  providerId: string;
  cuenta?: any;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{cuenta ? "Editar cuenta de cobro" : "Nueva cuenta de cobro"}</DialogTitle></DialogHeader>
        <form
          action={async (fd) => {
            setGuardando(true);
            try {
              if (cuenta) await updateProviderAccount(cuenta.id, providerId, fd);
              else await createProviderAccount(providerId, fd);
              toast({ title: "Guardado", variant: "success" });
              setOpen(false);
              router.refresh();
            } catch (e: any) {
              toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
            } finally {
              setGuardando(false);
            }
          }}
          className="space-y-3 max-h-[70vh] overflow-y-auto pr-1"
        >
          <CamposCuenta cuenta={cuenta} />
          <DialogFooter>
            <Button type="submit" variant="accent" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Las formas de cobrar de un proveedor. Se cargan una vez y cada reserva elige cuál usar,
 * que es lo que cambia de un camino a otro según cómo se haya negociado.
 */
export function PaymentAccountsCard({ providerId, cuentas }: { providerId: string; cuentas: any[] }) {
  const router = useRouter();

  async function archivar(id: string) {
    try {
      await archiveProviderAccount(id, providerId);
      toast({ title: "Cuenta archivada", description: "Las reservas que ya la usaban la conservan.", variant: "success" });
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-3">
      {cuentas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sin cuentas cargadas. Mientras no haya una, las reservas de este proveedor salen en el informe como &laquo;falta a dónde girar&raquo;.
        </p>
      )}
      {cuentas.map((c) => (
        <div key={c.id} className="rounded-md border p-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{c.alias || LABEL.get(c.method) || c.method}</span>
                <Badge variant="muted">{LABEL.get(c.method) ?? c.method}</Badge>
                {c.is_default && <Badge variant="accent"><Star className="h-3 w-3" /> Por defecto</Badge>}
              </div>
              <div className="mt-1"><Detalle c={c} /></div>
            </div>
            <div className="flex gap-1 shrink-0">
              <FormularioCuenta
                providerId={providerId}
                cuenta={c}
                trigger={<Button variant="ghost" size="sm" className="h-8 w-8 p-0"><Pencil className="h-3.5 w-3.5" /></Button>}
              />
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => archivar(c.id)} title="Archivar">
                <Archive className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      <FormularioCuenta
        providerId={providerId}
        trigger={<Button variant="outline" size="sm" className="w-full"><Plus className="h-4 w-4" /> Agregar cuenta</Button>}
      />
    </div>
  );
}
