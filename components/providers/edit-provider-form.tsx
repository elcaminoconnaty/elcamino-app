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
      {/* El proveedor cambia de dirección con los años (el Parador pasó de comercial.santiago2@
          a comercial.santiago@) y a veces la cena se habla en el hilo de otro alojamiento.
          Estas solo sirven para encontrar el hilo de Gmail; el correo sigue saliendo a Email. */}
      {/* Estas SI reciben: van en copia de cada correo al proveedor (el Pazo Santa María
          pide copia a reservas@fontedopicho.com). */}
      <div className="grid gap-2">
        <Label>Copias (CC)</Label>
        <Input
          name="cc_emails"
          defaultValue={(provider.cc_emails ?? []).join(", ")}
          placeholder="reservas@otrosistio.com"
        />
        <p className="text-xs text-muted-foreground">
          Reciben copia de cada rooming list y cada menú. Separadas por coma.
        </p>
      </div>
      <div className="grid gap-2">
        <Label>Otras direcciones</Label>
        <Input
          name="alt_emails"
          defaultValue={(provider.alt_emails ?? []).join(", ")}
          placeholder="reservas@hotel.es, comercial@hotel.es"
        />
        <p className="text-xs text-muted-foreground">
          Separadas por coma. Se usan para buscar el hilo de Gmail, no para enviar.
        </p>
      </div>
      <div className="grid gap-2"><Label>Teléfono</Label><Input name="phone" defaultValue={provider.phone ?? ""} /></div>
      <div className="grid gap-2"><Label>Ciudad</Label><Input name="city" defaultValue={provider.city ?? ""} /></div>
      <div className="grid gap-2"><Label>País</Label><Input name="country" defaultValue={provider.country ?? ""} /></div>
      {/* Lo que sale impreso en el documento de viaje del peregrino. Se carga una vez por
          hotel y sirve para todos los caminos donde aparezca. */}
      <div className="rounded-md border p-3 grid gap-3">
        <div className="text-xs uppercase tracking-widest text-ocre-profundo">Para el documento de viaje</div>
        <div className="grid gap-2">
          <Label>Dirección</Label>
          <Input name="address" defaultValue={provider.address ?? ""} placeholder="Rua Calvo Sotelo, 2" />
        </div>
        <div className="grid gap-2">
          <Label>Código postal, provincia y país</Label>
          <Input name="postal_code" defaultValue={provider.postal_code ?? ""} placeholder="27600 Sarria, Lugo, España" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Hora de entrada</Label>
            <Input name="check_in_time" defaultValue={provider.check_in_time ?? ""} placeholder="3pm" />
          </div>
          <div className="grid gap-2">
            <Label>Hora del desayuno</Label>
            <Input name="breakfast_time" defaultValue={provider.breakfast_time ?? ""} placeholder="7 am" />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Enlace de Google Maps</Label>
          <Input name="maps_url" defaultValue={provider.maps_url ?? ""} placeholder="https://maps.app.goo.gl/…" />
        </div>
        <p className="text-xs text-muted-foreground">
          Si este grupo tiene otra hora, se puede pisar en la reserva. Acá va la habitual del hotel.
        </p>
      </div>

      <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" rows={2} defaultValue={provider.notes ?? ""} /></div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={provider.active} />
        Activo
      </label>
      <Button type="submit" variant="accent" className="w-full">Guardar</Button>
    </form>
  );
}
