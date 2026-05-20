"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createReservation } from "@/lib/actions/reservations";
import { RESERVATION_STATUSES, PROVIDER_TYPES } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { Plus } from "lucide-react";

export function AddReservation({ departureId, providers }: { departureId: string; providers: any[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> Nueva reserva</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva reserva</DialogTitle></DialogHeader>
        <form
          action={async (fd) => {
            try {
              fd.set("departure_id", departureId);
              await createReservation(fd);
              toast({ title: "Reserva creada", variant: "success" });
              setOpen(false);
              router.refresh();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
          }}
          className="space-y-3"
        >
          <div className="grid gap-2">
            <Label>Proveedor *</Label>
            <select name="provider_id" required className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Seleccionar —</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Tipo</Label>
              <select name="type" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid gap-2"><Label>Lugar</Label><Input name="location" placeholder="Sarria" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label>Día camino</Label><Input name="day_number" type="number" min={1} /></div>
            <div className="grid gap-2"><Label>Check-in</Label><Input name="check_in" type="date" /></div>
            <div className="grid gap-2"><Label>Check-out</Label><Input name="check_out" type="date" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Camas</Label><Input name="beds_count" type="number" min={1} /></div>
            <div className="grid gap-2"><Label>Acomodación</Label><Input name="accommodation_type" placeholder="dorm, compartido, privado" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Costo estimado (EUR)</Label><Input name="estimated_cost_eur" type="number" step="0.01" /></div>
            <div className="grid gap-2"><Label>Costo confirmado (EUR)</Label><Input name="confirmed_cost_eur" type="number" step="0.01" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Estado</Label>
              <select name="status" defaultValue="presupuestado" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {RESERVATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="grid gap-2"><Label>Ref. confirmación</Label><Input name="confirmation_ref" /></div>
          </div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" rows={2} /></div>
          <DialogFooter>
            <Button type="submit" variant="accent">Crear</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
