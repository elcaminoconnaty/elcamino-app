"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { obtenerEnlaceRegistro, rotarEnlaceRegistro, aceptarSolicitud, rechazarSolicitud } from "@/lib/actions/registro";
import { ClipboardList, RefreshCw, UserPlus, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

/** "Copiar link del formulario" de inscripción (un solo enlace por camino) y rotarlo. */
export function CopiarEnlaceRegistro({ departureId }: { departureId: string }) {
  async function copiar(rotar = false) {
    if (rotar && !window.confirm("¿Cambiar el enlace del formulario? El que ya mandaste deja de funcionar.")) return;
    try {
      const r = rotar ? await rotarEnlaceRegistro(departureId) : await obtenerEnlaceRegistro(departureId);
      if (!r.ok) {
        toast({ title: "No se pudo generar el enlace", description: r.error, variant: "destructive" });
        return;
      }
      await navigator.clipboard.writeText(r.url);
      toast({ title: rotar ? "Enlace nuevo copiado" : "Enlace del formulario copiado", description: "Un solo enlace para el grupo: cada uno elige su nombre y llena sus datos.", variant: "success" });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  }
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="sm" onClick={() => copiar(false)} title="El formulario de inscripción del camino (reemplaza el Google Form)">
        <ClipboardList className="h-3.5 w-3.5" /> Copiar link del formulario
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => copiar(true)} title="Genera un enlace nuevo; el anterior deja de servir">
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export type Solicitud = { id: string; full_name: string; email: string | null; phone: string | null; payload: any; created_at: string };

/** Quienes abrieron el formulario y no estaban en la lista. */
export function SolicitudesRegistro({ solicitudes }: { solicitudes: Solicitud[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState<string | null>(null);
  if (solicitudes.length === 0) return null;

  async function resolver(id: string, aceptar: boolean) {
    setOcupado(id);
    try {
      const r = aceptar ? await aceptarSolicitud(id) : await rechazarSolicitud(id);
      if (!r.ok) {
        toast({ title: "No se pudo", description: r.error, variant: "destructive" });
        return;
      }
      toast({ title: aceptar ? "Peregrino creado e inscrito (pre-inscrito)" : "Solicitud descartada", variant: "success" });
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Card className="border-aviso-200 bg-aviso-50/40">
      <CardContent className="p-4 space-y-2">
        <div className="text-sm font-medium">Solicitudes del formulario ({solicitudes.length})</div>
        <p className="text-xs text-muted-foreground">Abrieron el formulario y no estaban en la lista. Al aceptar, se crea el peregrino y queda pre-inscrito; después le pasás el enlace para que llene sus datos.</p>
        <div className="space-y-1.5">
          {solicitudes.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{s.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {[s.email, s.phone].filter(Boolean).join(" · ")} · {formatDate(s.created_at.slice(0, 10))}
                  {s.payload?.mensaje && <span className="italic"> · &quot;{s.payload.mensaje}&quot;</span>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="accent" size="sm" onClick={() => resolver(s.id, true)} disabled={ocupado === s.id}>
                  <UserPlus className="h-3 w-3" /> Crear e inscribir
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => resolver(s.id, false)} disabled={ocupado === s.id}>
                  <X className="h-3 w-3" /> Descartar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
