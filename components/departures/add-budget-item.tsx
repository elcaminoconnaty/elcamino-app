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
import { SCALING_LABELS } from "@/lib/finance";
import { toast } from "@/components/ui/toaster";
import { Plus } from "lucide-react";

export function AddBudgetItem({
  departureId,
  providers,
  forceScaling,
  defaultDate,
  buttonLabel = "Agregar item",
}: {
  departureId: string;
  providers: any[];
  forceScaling?: "fijo_grupo" | "por_inscrito" | "por_pagante" | "viatico_team";
  defaultDate?: string;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [scaling, setScaling] = useState<string>(forceScaling ?? "por_inscrito");
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> {buttonLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{forceScaling === "viatico_team" ? "Nuevo viático del equipo" : "Nuevo item de presupuesto"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            try {
              fd.set("departure_id", departureId);
              fd.set("scaling", scaling);
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
          {!forceScaling && (
            <div className="grid gap-2">
              <Label>Escala (cómo crece el costo)</Label>
              <select value={scaling} onChange={(e) => setScaling(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(SCALING_LABELS).filter(([k]) => k !== "viatico_team").map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{SCALING_LABELS[scaling]?.description}</p>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Categoría</Label>
            <select name="category" required className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Descripción</Label>
              <Input name="description" required placeholder="Ej. Almuerzo Madrid, transporte aeropuerto" />
            </div>
            <div className="grid gap-2">
              <Label>Fecha</Label>
              <Input name="item_date" type="date" defaultValue={defaultDate ?? ""} />
            </div>
            <div className="grid gap-2"><Label>Estado</Label>
              <select name="status" defaultValue="presupuestado" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="presupuestado">Presupuestado</option>
                <option value="enviado">Enviado</option>
                <option value="reservado">Reservado</option>
                <option value="pagado">Pagado</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Cantidad</Label><Input name="quantity" type="number" step="0.01" defaultValue="1" required /></div>
            <div className="grid gap-2"><Label>Unidad</Label><Input name="unit" placeholder="grupo, persona, noche" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Costo estimado/u (EUR)</Label><Input name="estimated_unit_cost_eur" type="number" step="0.01" required /></div>
            <div className="grid gap-2"><Label>Costo confirmado/u (EUR)</Label><Input name="confirmed_unit_cost_eur" type="number" step="0.01" /></div>
          </div>
          {forceScaling !== "viatico_team" && (
            <div className="grid gap-2">
              <Label>Proveedor</Label>
              <select name="provider_id" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">(sin proveedor)</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.type}</option>)}
              </select>
            </div>
          )}
          <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" rows={2} /></div>
          <DialogFooter>
            <Button type="submit" variant="accent">Agregar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
