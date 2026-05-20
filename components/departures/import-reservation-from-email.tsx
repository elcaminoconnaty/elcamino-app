"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseReservationEmail, type ParsedReservation } from "@/lib/actions/parse-reservation-email";
import { createReservation, createProvider } from "@/lib/actions/reservations";
import { PROVIDER_TYPES, RESERVATION_STATUSES } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { Sparkles, Mail } from "lucide-react";

type Provider = { id: string; name: string; type: string };

export function ImportReservationFromEmail({ departureId, providers }: { departureId: string; providers: Provider[] }) {
  const [open, setOpen] = useState(false);
  const [emailText, setEmailText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedReservation | null>(null);
  const [saving, setSaving] = useState(false);
  const [providerId, setProviderId] = useState("");
  const router = useRouter();

  async function onParse() {
    if (!emailText.trim()) {
      toast({ title: "Pegá el correo primero", variant: "destructive" });
      return;
    }
    setParsing(true);
    try {
      const r = await parseReservationEmail(emailText, departureId);
      setParsed(r);
      setProviderId(r.provider_id ?? "");
    } catch (e: any) {
      toast({ title: "Error al parsear", description: e.message, variant: "destructive" });
    }
    setParsing(false);
  }

  async function onSave(fd: FormData) {
    setSaving(true);
    try {
      let pid = providerId;
      if (!pid && parsed?.provider_name_suggested) {
        const newProv = new FormData();
        newProv.set("name", parsed.provider_name_suggested);
        newProv.set("type", parsed.type);
        if (parsed.provider_email_suggested) newProv.set("email", parsed.provider_email_suggested);
        if (parsed.location) newProv.set("city", parsed.location);
        const created = await createProvider(newProv);
        pid = (created as any).id;
      }
      if (!pid) throw new Error("Seleccioná o creá un proveedor");
      fd.set("departure_id", departureId);
      fd.set("provider_id", pid);
      await createReservation(fd);
      toast({ title: "Reserva creada", variant: "success" });
      setOpen(false);
      setEmailText("");
      setParsed(null);
      setProviderId("");
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  function reset() {
    setEmailText("");
    setParsed(null);
    setProviderId("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Mail className="h-4 w-4" /> Importar desde correo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar reserva desde correo</DialogTitle>
          <DialogDescription>
            Pegá el cuerpo del correo del proveedor. Claude extrae los datos y vos confirmás antes de guardar.
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <>
            <Textarea
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              rows={14}
              placeholder="Pegá acá el cuerpo del correo del albergue, hotel, transporte, etc."
              className="font-mono text-xs"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button variant="accent" onClick={onParse} disabled={parsing || !emailText.trim()}>
                <Sparkles className="h-4 w-4" />
                {parsing ? "Analizando..." : "Analizar con Claude"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            action={onSave}
            className="space-y-3 max-h-[60vh] overflow-y-auto pr-1"
          >
            <div className="rounded-md bg-cream-100 p-3 text-xs flex items-center justify-between">
              <span>Confianza de extracción: <strong>{parsed.confidence}</strong></span>
              <button type="button" onClick={reset} className="text-camino-deepYellow hover:underline">← Pegar otro correo</button>
            </div>

            <div className="grid gap-2">
              <Label>Proveedor</Label>
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">
                  {parsed.provider_name_suggested
                    ? `+ Crear nuevo: ${parsed.provider_name_suggested}${parsed.provider_email_suggested ? ` (${parsed.provider_email_suggested})` : ""}`
                    : "— Seleccionar —"}
                </option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </select>
              {parsed.provider_id && providerId === parsed.provider_id && (
                <p className="text-xs text-green-700">✓ Match automático con proveedor existente</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Tipo</Label>
                <select name="type" defaultValue={parsed.type} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid gap-2"><Label>Lugar</Label><Input name="location" defaultValue={parsed.location ?? ""} /></div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2"><Label>Día camino</Label><Input name="day_number" type="number" min={1} defaultValue={parsed.day_number ?? ""} /></div>
              <div className="grid gap-2"><Label>Check-in</Label><Input name="check_in" type="date" defaultValue={parsed.check_in ?? ""} /></div>
              <div className="grid gap-2"><Label>Check-out</Label><Input name="check_out" type="date" defaultValue={parsed.check_out ?? ""} /></div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Camas</Label><Input name="beds_count" type="number" min={1} defaultValue={parsed.beds_count ?? ""} /></div>
              <div className="grid gap-2"><Label>Acomodación</Label><Input name="accommodation_type" defaultValue={parsed.accommodation_type ?? ""} /></div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Costo estimado (EUR)</Label><Input name="estimated_cost_eur" type="number" step="0.01" defaultValue={parsed.estimated_cost_eur ?? ""} /></div>
              <div className="grid gap-2"><Label>Costo confirmado (EUR)</Label><Input name="confirmed_cost_eur" type="number" step="0.01" defaultValue={parsed.confirmed_cost_eur ?? ""} /></div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Estado</Label>
                <select name="status" defaultValue={parsed.status} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {RESERVATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="grid gap-2"><Label>Ref. confirmación</Label><Input name="confirmation_ref" defaultValue={parsed.confirmation_ref ?? ""} /></div>
            </div>

            <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" rows={3} defaultValue={parsed.notes} /></div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="accent" disabled={saving}>
                {saving ? "Guardando..." : "Guardar reserva"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
