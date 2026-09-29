"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRegistration } from "@/lib/actions/pilgrims";
import { exigir } from "@/lib/resultado";
import { toast } from "@/components/ui/toaster";
import { Plus } from "lucide-react";

type P = { id: string; full_name: string; email: string | null; phone: string | null };

export function AddPilgrimToDeparture({ departureId, pilgrims }: { departureId: string; pilgrims: P[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [pilgrimId, setPilgrimId] = useState("");
  const [total, setTotal] = useState("");
  const [cop, setCop] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Estados para nuevo peregrino
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCountry, setNewCountry] = useState("Colombia");

  // Si el peregrino nuevo ya se creó pero la inscripción falló, el reintento lo reutiliza
  // en vez de crear otro igual.
  const creado = useRef<{ nombre: string; id: string } | null>(null);

  async function submit() {
    // Todo lo que se puede validar va antes de crear nada: si no, un total inválido dejaba
    // al peregrino creado sin inscripción.
    const t = Number(total);
    if (!t || t <= 0) {
      toast({ title: "Error", description: "Total inválido", variant: "destructive" });
      return;
    }
    if (mode === "new" && !newName.trim()) {
      toast({ title: "Error", description: "Escribe el nombre del peregrino", variant: "destructive" });
      return;
    }
    if (mode !== "new" && !pilgrimId) {
      toast({ title: "Error", description: "Seleccioná un peregrino", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let pid = pilgrimId;
      if (mode === "new") {
        if (creado.current && creado.current.nombre === newName) {
          pid = creado.current.id;
        } else {
          const res = await fetch("/api/pilgrims", {
            method: "POST",
            body: JSON.stringify({
              full_name: newName,
              email: newEmail || null,
              phone: newPhone || null,
              country: newCountry || null,
            }),
            headers: { "Content-Type": "application/json" },
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error ?? "Error creando peregrino");
          pid = json.id;
          creado.current = { nombre: newName, id: json.id };
        }
      }
      if (!pid) throw new Error("Seleccioná un peregrino");
      exigir(
        await createRegistration({
          pilgrim_id: pid,
          departure_id: departureId,
          total_eur: t,
          paid_in_cop_originally: cop,
        })
      );
      creado.current = null;
      toast({ title: "Peregrino inscrito", variant: "success" });
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
        <Button variant="accent"><Plus className="h-4 w-4" /> Inscribir peregrino</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inscribir peregrino</DialogTitle>
          <DialogDescription>Asociá un peregrino a esta salida con su precio acordado.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 text-sm">
          <Button type="button" variant={mode === "existing" ? "accent" : "outline"} size="sm" onClick={() => setMode("existing")}>Existente</Button>
          <Button type="button" variant={mode === "new" ? "accent" : "outline"} size="sm" onClick={() => setMode("new")}>Nuevo</Button>
        </div>

        {mode === "existing" ? (
          <div className="grid gap-2">
            <Label>Peregrino</Label>
            <select value={pilgrimId} onChange={(e) => setPilgrimId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Seleccionar —</option>
              {pilgrims.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}{p.email ? ` · ${p.email}` : ""}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2"><Label>Nombre completo</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Email</Label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
              <div className="grid gap-2"><Label>Teléfono</Label><Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} /></div>
            </div>
            <div className="grid gap-2"><Label>País</Label><Input value={newCountry} onChange={(e) => setNewCountry(e.target.value)} /></div>
          </div>
        )}

        <div className="grid gap-2">
          <Label>Precio acordado (EUR) *</Label>
          <Input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="2700" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cop} onChange={(e) => setCop(e.target.checked)} />
          Pagará en pesos colombianos (aplicará recálculo 1 mes antes)
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="accent" onClick={submit} disabled={saving}>{saving ? "Guardando..." : "Inscribir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
