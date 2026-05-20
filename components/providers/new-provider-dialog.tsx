"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProvider } from "@/lib/actions/reservations";
import { PROVIDER_TYPES } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { Plus } from "lucide-react";

export function NewProviderDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> Nuevo proveedor</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo proveedor</DialogTitle></DialogHeader>
        <form
          action={async (fd) => {
            try {
              await createProvider(fd);
              toast({ title: "Proveedor creado", variant: "success" });
              setOpen(false);
              router.refresh();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
          }}
          className="space-y-3"
        >
          <div className="grid gap-2"><Label>Nombre *</Label><Input name="name" required /></div>
          <div className="grid gap-2"><Label>Tipo</Label>
            <select name="type" required className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Contacto</Label><Input name="contact_name" /></div>
            <div className="grid gap-2"><Label>Email</Label><Input name="email" type="email" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label>Teléfono</Label><Input name="phone" /></div>
            <div className="grid gap-2"><Label>Ciudad</Label><Input name="city" /></div>
            <div className="grid gap-2"><Label>País</Label><Input name="country" defaultValue="España" /></div>
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
