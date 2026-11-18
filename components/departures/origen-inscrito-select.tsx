"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setReferredBy } from "@/lib/actions/pilgrims";
import { exigir } from "@/lib/resultado";
import { toast } from "@/components/ui/toaster";

/** En un camino en alianza: de parte de quién llegó este peregrino (ECN o el aliado). */
export function OrigenInscritoSelect({
  registrationId,
  value,
  socio,
}: {
  registrationId: string;
  value: "ecn" | "aliado" | null;
  socio: string;
}) {
  const [actual, setActual] = useState<string>(value ?? "");
  const [guardando, setGuardando] = useState(false);
  const router = useRouter();

  async function cambiar(nuevo: string) {
    const anterior = actual;
    setActual(nuevo);
    setGuardando(true);
    try {
      exigir(await setReferredBy(registrationId, nuevo === "ecn" || nuevo === "aliado" ? nuevo : null));
      router.refresh();
    } catch (e: any) {
      setActual(anterior);
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    }
    setGuardando(false);
  }

  return (
    <select
      value={actual}
      disabled={guardando}
      onChange={(e) => cambiar(e.target.value)}
      aria-label="De parte de quién llega"
      className={`h-8 rounded-md border border-input bg-background px-2 text-xs ${actual === "" ? "text-aviso-700" : ""}`}
    >
      <option value="">Sin definir</option>
      <option value="ecn">ECN</option>
      <option value="aliado">{socio}</option>
    </select>
  );
}
