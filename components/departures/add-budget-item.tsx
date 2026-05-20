"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createBudgetItem } from "@/lib/actions/budget";
import { BUDGET_CATEGORIES } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { Plus } from "lucide-react";

export function AddBudgetItem({ departureId, providers }: { departureId: string; providers: any[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> Agregar item</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo item de presupuesto</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            try {
              fd.set("departure_id", departureId);
              await createBudgetItem(fd);
              toast({ title: "Item agregado", variant: "success" });
              setOpen(false);
              router.refresh();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
          }}
          className="space-y-3"
        >
          <div className="grid gap-2">
            <Label>Categoría</Label>
            <select name="category" required className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Descripción</Label>
            <Input name="description" required placeholder="Albergue Casa Susi, día 4" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label>Cantidad</Label><Input name="quantity" type="number" step="0.01" defaultValue="1" required /></div>
            <div className="grid gap-2"><Label>Unidad</Label><Input name="unit" placeholder="cama, noche, grupo" /></div>
            <div className="grid gap-2"><Label>Estado</Label>
              <select name="status" defaultValue="estimado" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="estimado">Estimado</option>
                <option value="confirmado">Confirmado</option>
                <option value="pagado">Pagado</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Costo estimado/u (EUR)</Label><Input name="estimated_unit_cost_eur" type="number" step="0.01" required /></div>
            <div className="grid gap-2"><Label>Costo confirmado/u (EUR)</Label><Input name="confirmed_unit_cost_eur" type="number" step="0.01" /></div>
          </div>
          <div className="grid gap-2">
            <Label>Proveedor</Label>
            <select name="provider_id" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">(sin proveedor)</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.type}</option>)}
            </select>
          </div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" rows={2} /></div>
          <DialogFooter>
            <Button type="submit" variant="accent">Agregar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
