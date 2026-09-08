"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateRegistrationDetails } from "@/lib/actions/pilgrims";
import { toast } from "@/components/ui/toaster";
import { formatDate, formatEUR } from "@/lib/utils";
import { Pencil } from "lucide-react";

type DepartureOption = { id: string; name: string; start_date: string | null; status: string };

const ESTADOS = ["pre_inscrito", "inscrito", "confirmado", "viajado", "cancelado"];

export function EditRegistrationDialog({
  registration,
  departures,
}: {
  registration: {
    registration_id: string;
    departure_id: string;
    total_eur: number;
    discount_eur: number;
    /** Penalidad en EUR (ej. por cambio de camino). Se suma a lo que debe. */
    penalty_eur?: number;
    penalty_note?: string | null;
    status: string;
    paid_in_cop_originally: boolean;
    notes?: string | null;
  };
  departures: DepartureOption[];
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [departureId, setDepartureId] = useState(registration.departure_id);
  const [total, setTotal] = useState(String(registration.total_eur ?? ""));
  const [discount, setDiscount] = useState(String(registration.discount_eur ?? "0"));
  const [penalty, setPenalty] = useState(String(registration.penalty_eur ?? "0"));
  const [penaltyNote, setPenaltyNote] = useState(registration.penalty_note ?? "");
  const [status, setStatus] = useState(registration.status);
  const [cop, setCop] = useState(registration.paid_in_cop_originally);
  const [notes, setNotes] = useState(registration.notes ?? "");
  const router = useRouter();

  const cambiaCamino = departureId !== registration.departure_id;
  const penalidad = Number(penalty) || 0;
  const totalAPagar = (Number(total) || 0) - (Number(discount) || 0) + penalidad;

  async function submit() {
    const t = Number(total);
    if (!t || t <= 0) {
      toast({ title: "Total inválido", variant: "destructive" });
      return;
    }
    if (penalidad < 0) {
      toast({ title: "La penalidad no puede ser negativa", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateRegistrationDetails(registration.registration_id, {
        departure_id: departureId,
        total_eur: t,
        discount_eur: Number(discount) || 0,
        penalty_eur: penalidad,
        penalty_note: penalidad > 0 ? penaltyNote.trim() || null : null,
        status,
        paid_in_cop_originally: cop,
        notes: notes || null,
      });
      toast({ title: "Inscripción actualizada", variant: "success" });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="h-4 w-4" /> Editar inscripción</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar inscripción</DialogTitle>
          <DialogDescription>Cambiá el camino, el precio acordado, una penalidad o el estado de esta inscripción.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label>Camino</Label>
          <select
            value={departureId}
            onChange={(e) => setDepartureId(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {departures.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.start_date ? ` · ${formatDate(d.start_date)}` : ""}
              </option>
            ))}
          </select>
          {cambiaCamino && (
            <p className="text-xs text-aviso-700">
              Los abonos y el plan de pagos se mueven con la inscripción al nuevo camino. Revisá que las fechas de las
              cuotas sigan teniendo sentido, y si el cambio tiene penalidad, cargala abajo para que el saldo quede bien.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Precio acordado (EUR) *</Label>
            <Input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Descuento (EUR)</Label>
            <Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Penalidad (EUR)</Label>
            <Input type="number" step="0.01" min="0" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Motivo de la penalidad</Label>
            <Input
              value={penaltyNote}
              onChange={(e) => setPenaltyNote(e.target.value)}
              placeholder="Cambio de camino"
              disabled={penalidad <= 0}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          La penalidad se suma a lo que debe el peregrino; los abonos que ya hizo quedan como están.
          {" "}Total a pagar: <strong>{formatEUR(totalAPagar)}</strong>
          {penalidad > 0 && ` (precio ${formatEUR(totalAPagar - penalidad)} + penalidad ${formatEUR(penalidad)})`}.
        </p>

        <div className="grid gap-2">
          <Label>Estado</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {ESTADOS.map((s) => (
              <option key={s} value={s}>{s.replace("_", "-")}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cop} onChange={(e) => setCop(e.target.checked)} />
          Paga en pesos colombianos (aplica recálculo 1 mes antes)
        </label>

        <div className="grid gap-2">
          <Label>Notas</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="accent" onClick={submit} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
