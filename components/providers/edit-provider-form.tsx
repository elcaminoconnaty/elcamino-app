"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateProvider } from "@/lib/actions/reservations";
import { PROVIDER_TYPES } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";

export function EditProviderForm({ provider }: { provider: any }) {
  const router = useRouter();
  return (
    <form
      action={async (fd) => {
        try {
          await updateProvider(provider.id, fd);
          toast({ title: "Guardado", variant: "success" });
          router.refresh();
        } catch (e: any) {
          toast({ title: "Error", description: e.message, variant: "destructive" });
        }
      }}
      className="space-y-3"
    >
      <div className="grid gap-2"><Label>Nombre</Label><Input name="name" defaultValue={provider.name} required /></div>
      <div className="grid gap-2"><Label>Tipo</Label>
        <select name="type" defaultValue={provider.type} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="grid gap-2"><Label>Contacto</Label><Input name="contact_name" defaultValue={provider.contact_name ?? ""} /></div>
      <div className="grid gap-2"><Label>Email</Label><Input name="email" type="email" defaultValue={provider.email ?? ""} /></div>
      <div className="grid gap-2"><Label>Teléfono</Label><Input name="phone" defaultValue={provider.phone ?? ""} /></div>
      <div className="grid gap-2"><Label>Ciudad</Label><Input name="city" defaultValue={provider.city ?? ""} /></div>
      <div className="grid gap-2"><Label>País</Label><Input name="country" defaultValue={provider.country ?? ""} /></div>
      <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" rows={2} defaultValue={provider.notes ?? ""} /></div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={provider.active} />
        Activo
      </label>
      <Button type="submit" variant="accent" className="w-full">Guardar</Button>
    </form>
  );
}
