"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { freezeDepartureTRM } from "@/lib/actions/departures";
import { toast } from "@/components/ui/toaster";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

export function FreezeTrmBanner({ departureId, startDate }: { departureId: string; startDate: string }) {
  const [open, setOpen] = useState(false);
  const [trm, setTrm] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function submit() {
    const n = Number(trm);
    if (!n || n <= 0) {
      toast({ title: "TRM inválida", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await freezeDepartureTRM(departureId, n, date);
      toast({ title: "TRM congelada", variant: "success" });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <Card className="border-camino-yellow border-2 bg-camino-yellow/10">
      <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-camino-deepYellow mt-0.5" />
          <div>
            <div className="font-medium">Congelá la TRM para esta salida</div>
            <p className="text-sm text-muted-foreground">
              La salida es el {startDate}. Es momento de fijar la tasa para recalcular el saldo COP de los peregrinos que pagaron en pesos.
            </p>
          </div>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>Congelar TRM</Button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Congelar TRM de la salida</DialogTitle>
              <DialogDescription>
                Esto fijará la TRM EUR/COP usada para calcular el saldo pendiente de cada peregrino que pagó en pesos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="trm">TRM EUR/COP</Label>
                <Input id="trm" type="number" step="0.01" value={trm} onChange={(e) => setTrm(e.target.value)} placeholder="4500.00" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="date">Fecha de la TRM</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button variant="accent" onClick={submit} disabled={saving}>
                {saving ? "Guardando..." : "Congelar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
