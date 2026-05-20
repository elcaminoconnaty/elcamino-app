"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setTrm } from "@/lib/actions/trm";
import { toast } from "@/components/ui/toaster";

export function NewTrmForm({ latestRate }: { latestRate: number | null }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rate, setRate] = useState(latestRate ? String(latestRate) : "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const n = Number(rate);
      if (!n || n <= 0) throw new Error("Tasa inválida");
      await setTrm(date, n, notes);
      toast({ title: "TRM guardada", variant: "success" });
      router.refresh();
      setNotes("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-2"><Label>Fecha</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
      <div className="grid gap-2"><Label>TRM EUR/COP</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required placeholder="4500.00" /></div>
      <div className="grid gap-2"><Label>Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Banco Rep., Wise..." /></div>
      <Button type="submit" variant="accent" className="w-full" disabled={saving}>{saving ? "Guardando..." : "Guardar TRM"}</Button>
    </form>
  );
}
