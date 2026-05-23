"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deletePassportsForDeparture } from "@/lib/actions/passport";
import { toast } from "@/components/ui/toaster";
import { Trash2 } from "lucide-react";

export function DeletePassportsButton({ departureId }: { departureId: string }) {
  const [working, setWorking] = useState(false);
  const router = useRouter();

  async function onClick() {
    if (!confirm("¿Borrar las fotos de pasaporte de todos los peregrinos de este camino? Esta acción no se puede deshacer (los datos extraídos quedan).")) return;
    setWorking(true);
    try {
      const result = await deletePassportsForDeparture(departureId);
      toast({ title: `${result.deleted} pasaportes borrados`, variant: "success" });
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setWorking(false);
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={working}>
      <Trash2 className="h-4 w-4" /> {working ? "Borrando..." : "Borrar pasaportes del viaje"}
    </Button>
  );
}
