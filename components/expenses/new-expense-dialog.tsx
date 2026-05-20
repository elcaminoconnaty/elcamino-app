"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createExpense } from "@/lib/actions/expenses";
import { getTrmForDate } from "@/lib/actions/payments";
import {
  PAYMENT_METHODS,
  EXPENSE_KINDS,
  EXPENSE_CATEGORIES_OPERATIVO,
  EXPENSE_CATEGORIES_PERSONAL,
} from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { Plus } from "lucide-react";

export function NewExpenseDialog({ departures, defaultDepartureId }: { departures: any[]; defaultDepartureId?: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"operativo" | "personal">("operativo");
  const [currency, setCurrency] = useState<"EUR" | "COP" | "USD">("COP");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [trm, setTrm] = useState("");
  const router = useRouter();
  const cats = kind === "operativo" ? EXPENSE_CATEGORIES_OPERATIVO : EXPENSE_CATEGORIES_PERSONAL;

  useEffect(() => {
    if (currency === "COP" && open) {
      getTrmForDate(date).then((r) => r && setTrm(String(r)));
    }
  }, [currency, date, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> Nuevo gasto</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo gasto / movimiento</DialogTitle></DialogHeader>
        <form
          action={async (fd) => {
            try {
              await createExpense(fd);
              toast({ title: "Gasto registrado", variant: "success" });
              setOpen(false);
              router.refresh();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
          }}
          className="space-y-3"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Fecha</Label><Input name="expense_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Tipo</Label>
              <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {EXPENSE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-2"><Label>Categoría</Label>
            <select name="category" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid gap-2"><Label>Descripción</Label><Input name="description" placeholder="Marketing Instagram, mercado del mes, etc." /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-2"><Label>Monto *</Label><Input name="amount" type="number" step="0.01" required /></div>
            <div className="grid gap-2"><Label>Divisa</Label>
              <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="COP">COP</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          {currency === "COP" && (
            <div className="grid gap-2"><Label>TRM (autocompletado)</Label><Input name="trm_eur_cop" type="number" step="0.01" value={trm} onChange={(e) => setTrm(e.target.value)} /></div>
          )}
          {kind === "operativo" && (
            <div className="grid gap-2"><Label>Camino (opcional)</Label>
              <select name="departure_id" defaultValue={defaultDepartureId ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">(General)</option>
                {departures.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid gap-2"><Label>Método de pago</Label>
            <select name="payment_method" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
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
