"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPilgrim } from "@/lib/actions/pilgrims";
import { Plus } from "lucide-react";

export function NewPilgrimDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> Nuevo peregrino</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo peregrino</DialogTitle></DialogHeader>
        <form action={createPilgrim} className="space-y-3">
          <div className="grid gap-2"><Label>Nombre completo *</Label><Input name="full_name" required /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Email</Label><Input name="email" type="email" /></div>
            <div className="grid gap-2"><Label>Teléfono</Label><Input name="phone" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>País</Label><Input name="country" defaultValue="Colombia" /></div>
            <div className="grid gap-2"><Label>Documento</Label><Input name="document_id" /></div>
          </div>
          <div className="grid gap-2"><Label>Fecha de nacimiento</Label><Input name="birth_date" type="date" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Contacto emergencia</Label><Input name="emergency_contact_name" /></div>
            <div className="grid gap-2"><Label>Teléfono emergencia</Label><Input name="emergency_contact_phone" /></div>
          </div>
          <div className="grid gap-2"><Label>Notas dietarias</Label><Textarea name="dietary_notes" rows={2} /></div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" rows={2} /></div>
          <DialogFooter>
            <Button type="submit" variant="accent">Crear</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
