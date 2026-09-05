"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updatePilgrim } from "@/lib/actions/pilgrims";
import { toast } from "@/components/ui/toaster";
import { Pencil } from "lucide-react";

export function EditPilgrimDialog({ pilgrim }: { pilgrim: any }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="h-4 w-4" /> Editar datos</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar peregrino</DialogTitle></DialogHeader>
        <form
          action={async (fd) => {
            setSaving(true);
            try {
              await updatePilgrim(pilgrim.id, fd);
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
          <div className="grid gap-2"><Label>Nombre completo *</Label><Input name="full_name" defaultValue={pilgrim.full_name} required /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Email</Label><Input name="email" type="email" defaultValue={pilgrim.email ?? ""} /></div>
            <div className="grid gap-2"><Label>Teléfono</Label><Input name="phone" defaultValue={pilgrim.phone ?? ""} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>País</Label><Input name="country" defaultValue={pilgrim.country ?? ""} /></div>
            <div className="grid gap-2"><Label>Cédula</Label><Input name="document_id" defaultValue={pilgrim.document_id ?? ""} /></div>
          </div>
          {/* La dirección y el tipo de documento son lo que el contrato necesita y la ficha
              no guardaba: la cláusula 23 fija dónde se notifica al viajero, y la cláusula de
              partes dice si se identifica con pasaporte o con cédula. */}
          <div className="grid gap-2">
            <Label>Dirección de notificaciones</Label>
            <Input name="address" defaultValue={pilgrim.address ?? ""} placeholder="Calle, número, ciudad y país" />
            <p className="text-xs text-muted-foreground">Va en el contrato (cláusula 23). Sin esto no se puede emitir.</p>
          </div>
          <div className="grid gap-2">
            <Label>En el contrato se identifica con</Label>
            <select
              name="document_kind"
              defaultValue={pilgrim.document_kind ?? ""}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Automático (pasaporte si lo tiene cargado)</option>
              <option value="pasaporte">Pasaporte</option>
              <option value="cedula">Cédula de ciudadanía</option>
            </select>
          </div>
          <div className="grid gap-2"><Label>Fecha de nacimiento</Label><Input name="birth_date" type="date" defaultValue={pilgrim.birth_date ?? ""} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Contacto emergencia</Label><Input name="emergency_contact_name" defaultValue={pilgrim.emergency_contact_name ?? ""} /></div>
            <div className="grid gap-2"><Label>Teléfono emergencia</Label><Input name="emergency_contact_phone" defaultValue={pilgrim.emergency_contact_phone ?? ""} /></div>
          </div>
          <div className="grid gap-2"><Label>Notas dietarias</Label><Textarea name="dietary_notes" rows={2} defaultValue={pilgrim.dietary_notes ?? ""} /></div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" rows={2} defaultValue={pilgrim.notes ?? ""} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="accent" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
