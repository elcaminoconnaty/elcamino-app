"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateBudgetItem, deleteBudgetItem } from "@/lib/actions/budget";
import { BUDGET_CATEGORIES, BUDGET_STATUSES } from "@/lib/constants";
import { SCALING_LABELS } from "@/lib/finance";
import { toast } from "@/components/ui/toaster";
import { Pencil, Trash2 } from "lucide-react";

export function EditBudgetItemDialog({ item, providers, departureId, lockScaling }: { item: any; providers: any[]; departureId: string; lockScaling?: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scaling, setScaling] = useState<string>(item.scaling);
  const router = useRouter();

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
                status: fd.get("status")?.toString() || item.status,
                scaling: lockScaling ? item.scaling : scaling,
                item_date: fd.get("item_date")?.toString() || null,
                notes: fd.get("notes")?.toString() || null,
              };
              await updateBudgetItem(item.id, payload, departureId);
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
              <select name="status" defaultValue={item.status} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {BUDGET_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
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
