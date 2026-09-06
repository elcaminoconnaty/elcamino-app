"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { DAY_KIND_LABELS } from "@/lib/data/wizard-steps";
import { guardarEtapas, leerEtapas, type EtapaInput } from "@/lib/actions/route-stages";

/**
 * Las etapas de la ruta: el esqueleto del que salen el itinerario del documento de viaje,
 * el trazado del mapa y los días del presupuesto.
 *
 * Hasta ahora solo se leían; para cambiarlas había que entrar por SQL.
 *
 * Convención de la plataforma: el **día 1 es el primero** y no existe el día 0. Los números
 * negativos son días previos (el vuelo, la noche en Madrid).
 */
export function EditorEtapas({ routeId, nombreRuta }: { routeId: string; nombreRuta: string }) {
  const [abierto, setAbierto] = useState(false);
  const [etapas, setEtapas] = useState<EtapaInput[]>([]);
  const [cargando, setCargando] = useState(false);
  const [pendiente, empezar] = useTransition();

  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    leerEtapas(routeId)
      .then(setEtapas)
      .catch((e) => toast({ title: "No pude leer las etapas", description: e.message, variant: "destructive" }))
      .finally(() => setCargando(false));
  }, [abierto, routeId]);

  const set = (i: number, campo: keyof EtapaInput, valor: any) =>
    setEtapas((prev) => prev.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)));

  const añadir = () =>
    setEtapas((prev) => [
      ...prev,
      {
        day_offset: prev.length ? Math.max(...prev.map((e) => e.day_offset)) + 1 : 1,
        day_kind: "camino",
        from_place: prev[prev.length - 1]?.to_place ?? null,
        to_place: null,
        km: null,
        hours_approx: null,
        description: null,
      },
    ]);

  const totalKm = etapas.reduce((s, e) => s + Number(e.km ?? 0), 0);
  const diasCaminados = etapas.filter((e) => e.day_kind === "camino").length;

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Etapas</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Etapas de {nombreRuta}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          De acá salen el itinerario del documento de viaje, el trazado del mapa y los días del
          presupuesto. El día 1 es el primero — no existe el 0, y los negativos son días previos.
        </p>

        {cargando ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Leyendo…</p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-ocre-profundo">
                  <th className="pb-2 pr-2 w-16">Día</th>
                  <th className="pb-2 pr-2 w-36">Tipo</th>
                  <th className="pb-2 pr-2">Desde</th>
                  <th className="pb-2 pr-2">Hasta</th>
                  <th className="pb-2 pr-2 w-20">Km</th>
                  <th className="pb-2 pr-2 w-32">Horas aprox.</th>
                  <th className="pb-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {etapas.map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1.5 pr-2">
                      <Input
                        type="number"
                        value={e.day_offset}
                        onChange={(ev) => set(i, "day_offset", Number(ev.target.value))}
                        className="h-8"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={e.day_kind}
                        onChange={(ev) => set(i, "day_kind", ev.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {Object.entries(DAY_KIND_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input value={e.from_place ?? ""} onChange={(ev) => set(i, "from_place", ev.target.value)} className="h-8" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input value={e.to_place ?? ""} onChange={(ev) => set(i, "to_place", ev.target.value)} className="h-8" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        type="number"
                        step="0.1"
                        value={e.km ?? ""}
                        onChange={(ev) => set(i, "km", ev.target.value === "" ? null : Number(ev.target.value))}
                        className="h-8"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={e.hours_approx ?? ""}
                        onChange={(ev) => set(i, "hours_approx", ev.target.value)}
                        placeholder="6 horas aprox."
                        className="h-8"
                      />
                    </td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        aria-label="Quitar etapa"
                        onClick={() => setEtapas((prev) => prev.filter((_, j) => j !== i))}
                        className="rounded p-1 text-error-700 hover:bg-error-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {etapas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      Esta ruta no tiene etapas. Sin ellas el documento de viaje no puede armar el itinerario.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <Button variant="outline" size="sm" onClick={añadir}>
            <Plus className="h-4 w-4" /> Añadir etapa
          </Button>
          <span className="text-xs text-muted-foreground">
            {diasCaminados} días caminados · {totalKm.toLocaleString("es-CO")} km
          </span>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
          <Button
            variant="accent"
            disabled={pendiente}
            onClick={() =>
              empezar(async () => {
                try {
                  await guardarEtapas(routeId, etapas);
                  toast({ title: "Etapas guardadas", variant: "success" });
                  setAbierto(false);
                } catch (e: any) {
                  toast({ title: "No se pudo", description: e?.message, variant: "destructive" });
                }
              })
            }
          >
            {pendiente ? "Guardando…" : "Guardar etapas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
