"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { deletePilgrim, type DeletePilgrimMode } from "@/lib/actions/pilgrims";
import { toast } from "@/components/ui/toaster";
import { formatEUR } from "@/lib/utils";
import { Trash2 } from "lucide-react";

export function DeletePilgrimDialog({
  pilgrimId,
  pilgrimName,
  paymentsCount,
  paidEur,
}: {
  pilgrimId: string;
  pilgrimName: string;
  paymentsCount: number;
  paidEur: number;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DeletePilgrimMode | "">("");
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const tieneAbonos = paymentsCount > 0;

  async function submit() {
    if (tieneAbonos && !mode) {
      toast({ title: "Elegí qué hacer con los abonos", variant: "destructive" });
      return;
    }
    setDeleting(true);
    try {
      await deletePilgrim(pilgrimId, tieneAbonos ? (mode as DeletePilgrimMode) : undefined);
      toast({ title: "Peregrino eliminado", variant: "success" });
      setOpen(false);
      router.push("/peregrinos");
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMode(""); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-error-700 border-error-200 hover:bg-error-50">
          <Trash2 className="h-4 w-4" /> Eliminar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar a {pilgrimName}</DialogTitle>
          <DialogDescription>
            {tieneAbonos
              ? `Tiene ${paymentsCount} abono${paymentsCount === 1 ? "" : "s"} por ${formatEUR(paidEur)}. Antes de eliminar hay que decidir qué pasa con esa plata.`
              : "No tiene abonos registrados. Se eliminan sus datos e inscripciones. Esta acción no se puede deshacer."}
          </DialogDescription>
        </DialogHeader>

        {tieneAbonos && (
          <div className="space-y-2">
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer text-sm has-[:checked]:border-ocre has-[:checked]:bg-piedra-suave">
              <input
                type="radio"
                name="abonos"
                className="mt-1"
                checked={mode === "sin_reembolso"}
                onChange={() => setMode("sin_reembolso")}
              />
              <span>
                <span className="font-medium block">Se retiró sin reembolso</span>
                <span className="text-muted-foreground">
                  Los abonos ({formatEUR(paidEur)}) quedan en el módulo financiero como ingreso del camino, marcados como de alguien que se retiró.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer text-sm has-[:checked]:border-ocre has-[:checked]:bg-piedra-suave">
              <input
                type="radio"
                name="abonos"
                className="mt-1"
                checked={mode === "reembolsado"}
                onChange={() => setMode("reembolsado")}
              />
              <span>
                <span className="font-medium block">Se le hizo reembolso</span>
                <span className="text-muted-foreground">
                  La plata se devolvió: los abonos se eliminan del módulo financiero junto con el peregrino y sus inscripciones.
                </span>
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={submit} disabled={deleting || (tieneAbonos && !mode)}>
            {deleting ? "Eliminando..." : "Eliminar peregrino"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
