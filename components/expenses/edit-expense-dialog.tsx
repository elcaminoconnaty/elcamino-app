"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateExpense, deleteExpense } from "@/lib/actions/expenses";
import {
  PAYMENT_METHODS,
  ACCOUNTS,
  EXPENSE_KINDS,
  EXPENSE_CATEGORIES_OPERATIVO,
  EXPENSE_CATEGORIES_PERSONAL,
} from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { Pencil, Trash2 } from "lucide-react";

export function EditExpenseDialog({ expense, departures }: { expense: any; departures: any[] }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [kind, setKind] = useState<"operativo" | "personal">(expense.kind);
  const router = useRouter();
  const cats = kind === "operativo" ? EXPENSE_CATEGORIES_OPERATIVO : EXPENSE_CATEGORIES_PERSONAL;

  async function onDelete() {
    if (!confirm("¿Eliminar este gasto?")) return;
    setDeleting(true);
    try {
      await deleteExpense(expense.id);
      toast({ title: "Eliminado", variant: "success" });
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
        <DialogHeader><DialogTitle>Editar gasto</DialogTitle></DialogHeader>
        <form
          action={async (fd) => {
            setSaving(true);
            try {
              const payload: any = {
                expense_date: fd.get("expense_date"),
                kind,
                category: fd.get("category"),
                description: fd.get("description")?.toString() || null,
                amount: Number(fd.get("amount") || 0),
                currency: fd.get("currency"),
                trm_eur_cop: fd.get("trm_eur_cop") ? Number(fd.get("trm_eur_cop")) : null,
                departure_id: fd.get("departure_id")?.toString() || null,
                payment_method: fd.get("payment_method")?.toString() || null,
                account: fd.get("account")?.toString() || null,
                notes: fd.get("notes")?.toString() || null,
              };
              await updateExpense(expense.id, payload);
              toast({ title: "Guardado", variant: "success" });
              setOpen(false);
              router.refresh();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
            setSaving(false);
          }}
          className="space-y-3"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Fecha</Label><Input name="expense_date" type="date" defaultValue={expense.expense_date} /></div>
            <div className="grid gap-2"><Label>Tipo</Label>
              <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {EXPENSE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-2"><Label>Categoría</Label>
            <select name="category" defaultValue={expense.category} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid gap-2"><Label>Descripción</Label><Input name="description" defaultValue={expense.description ?? ""} /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-2"><Label>Monto</Label><Input name="amount" type="number" step="0.01" defaultValue={expense.amount} /></div>
            <div className="grid gap-2"><Label>Divisa</Label>
              <select name="currency" defaultValue={expense.currency} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="COP">COP</option><option value="EUR">EUR</option><option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div className="grid gap-2"><Label>TRM</Label><Input name="trm_eur_cop" type="number" step="0.01" defaultValue={expense.trm_eur_cop ?? ""} /></div>
          {kind === "operativo" && (
            <div className="grid gap-2"><Label>Camino</Label>
              <select name="departure_id" defaultValue={expense.departure_id ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">(General)</option>
                {departures.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Método</Label>
              <select name="payment_method" defaultValue={expense.payment_method ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">—</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="grid gap-2"><Label>Cuenta / dónde está la plata</Label>
              <select name="account" defaultValue={expense.account ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">—</option>
                {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" defaultValue={expense.notes ?? ""} rows={2} /></div>
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
