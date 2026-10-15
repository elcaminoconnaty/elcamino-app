"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { cambiarMiClave, restablecerClave } from "@/lib/actions/acceso";

export type Integrante = {
  id: string;
  nombre: string;
  rol: string;
  conCedula: boolean;
  claveCreada: string | null;
  ultimaEntrada: string | null;
};

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }) : "—";

export function Equipo({ integrantes, yo }: { integrantes: Integrante[]; yo: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState<string | null>(null);

  async function restablecer(p: Integrante) {
    if (!confirm(`¿Restablecer la contraseña de ${p.nombre}? La próxima vez que entre con su cédula va a crear una nueva.`)) return;
    setOcupado(p.id);
    const r = await restablecerClave(p.id);
    setOcupado(null);
    if (!r.ok) return toast({ title: "No se pudo", description: r.error, variant: "destructive" });
    toast({ title: "Listo", description: `${p.nombre} crea su contraseña nueva al entrar.`, variant: "success" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <ul className="divide-y rounded-lg border">
        {integrantes.map((p) => (
          <li key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                {p.nombre} {p.id === yo && <span className="text-xs text-muted-foreground">(vos)</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="capitalize">{p.rol}</span>
                {" · "}
                {!p.conCedula
                  ? "cuenta con correo (la compartida de antes)"
                  : p.claveCreada
                    ? `contraseña creada el ${fecha(p.claveCreada)}`
                    : "pendiente: crea su contraseña al entrar con la cédula"}
                {" · "}última entrada: {fecha(p.ultimaEntrada)}
              </div>
            </div>
            {p.conCedula && p.claveCreada && p.id !== yo && (
              <Button variant="outline" size="sm" className="h-9" disabled={ocupado === p.id} onClick={() => restablecer(p)}>
                {ocupado === p.id ? "Restableciendo…" : "Restablecer contraseña"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <CambiarClave />
    </div>
  );
}

function CambiarClave() {
  const [clave, setClave] = React.useState("");
  const [clave2, setClave2] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (clave !== clave2) return toast({ title: "No coinciden", description: "Las dos contraseñas tienen que ser iguales.", variant: "destructive" });
    setOcupado(true);
    const r = await cambiarMiClave(clave);
    setOcupado(false);
    if (!r.ok) return toast({ title: "No se pudo", description: r.error, variant: "destructive" });
    setClave("");
    setClave2("");
    toast({ title: "Listo", description: "Tu contraseña quedó cambiada.", variant: "success" });
  }

  return (
    <form onSubmit={guardar} className="space-y-3 max-w-sm">
      <div className="text-sm font-medium">Cambiar mi contraseña</div>
      <div className="space-y-1.5">
        <Label htmlFor="clave-nueva">Nueva</Label>
        <Input id="clave-nueva" type="password" minLength={8} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" className="text-base" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="clave-nueva2">Repetila</Label>
        <Input id="clave-nueva2" type="password" minLength={8} value={clave2} onChange={(e) => setClave2(e.target.value)} autoComplete="new-password" className="text-base" />
      </div>
      <Button type="submit" variant="outline" disabled={ocupado || clave.length < 8 || !clave2}>
        {ocupado ? "Guardando…" : "Cambiar"}
      </Button>
    </form>
  );
}
