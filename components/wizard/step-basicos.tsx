"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyRouteTemplate } from "@/lib/actions/route-template";
import { updateDeparture } from "@/lib/actions/departures";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/utils";
import { Sparkles, Calendar } from "lucide-react";
import { DAY_KIND_LABELS } from "@/lib/data/wizard-steps";

export function StepBasicos({
  departure,
  route,
  days,
  hasItems,
  allRoutes,
}: {
  departure: any;
  route: any;
  days: any[];
  hasItems: boolean;
  allRoutes: any[];
}) {
  const [name, setName] = useState(departure.name);
  const [routeId, setRouteId] = useState(departure.route_id ?? "");
  const [startDate, setStartDate] = useState(departure.start_date ?? "");
  const [endDate, setEndDate] = useState(departure.end_date ?? "");
  const [capacity, setCapacity] = useState(String(departure.capacity ?? ""));
  const [basePrice, setBasePrice] = useState(String(departure.base_price_eur ?? ""));
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function saveBasics() {
    setSaving(true);
    const fd = new FormData();
    fd.set("name", name);
    if (routeId) fd.set("route_id", routeId);
    fd.set("start_date", startDate);
    if (endDate) fd.set("end_date", endDate);
    if (capacity) fd.set("capacity", capacity);
    fd.set("base_price_eur", basePrice || "0");
    fd.set("status", departure.status);
    try {
      await updateDeparture(departure.id, fd);
      toast({ title: "Datos guardados", variant: "success" });
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function onApplyTemplate() {
    if (!routeId) {
      toast({ title: "Asigná una ruta y guardá primero", variant: "destructive" });
      return;
    }
    if (!startDate) {
      toast({ title: "Falta la fecha de inicio", variant: "destructive" });
      return;
    }
    if (hasItems && !confirm("Ya hay items en el presupuesto. Aplicar la plantilla solo agrega los que falten — no pisa lo existente. ¿Continuar?")) return;
    setApplying(true);
    try {
      const r = await applyRouteTemplate(departure.id);
      toast({ title: `${r.created} items creados desde plantilla`, variant: "success" });
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setApplying(false);
  }

  const hasRouteMismatch = routeId && routeId !== (departure.route_id ?? "");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Datos del camino</CardTitle>
          <CardDescription>Confirmá la ruta, la fecha de inicio del primer día caminado y el N° esperado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Label>Ruta *</Label>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Seleccionar ruta —</option>
              {allRoutes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {!departure.route_id && (
              <p className="text-xs text-amber-700">⚠ Este camino no tiene ruta asignada. Elegí una y tocá "Guardar".</p>
            )}
            {hasRouteMismatch && (
              <p className="text-xs text-amber-700">Hay un cambio pendiente — tocá "Guardar datos básicos" para confirmar.</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label>Nombre del camino</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Fecha del día 1 (inicio camino)</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Fecha de fin (último día post-camino)</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Capacidad</Label>
              <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Precio base / peregrino (EUR)</Label>
              <Input type="number" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
            </div>
          </div>
          <Button variant="accent" onClick={saveBasics} disabled={saving}>{saving ? "Guardando..." : "Guardar datos básicos"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Días planificados según la ruta</CardTitle>
          <CardDescription>Esto se calcula automáticamente a partir de la fecha del día 1. Si necesitás más días antes o después, los podés agregar manualmente en los pasos de viáticos.</CardDescription>
        </CardHeader>
        <CardContent>
          {days.length === 0 ? (
            <div className="text-sm text-muted-foreground">Asigná una ruta y fecha de inicio para ver los días.</div>
          ) : (
            <div className="space-y-1">
              {days.map((d) => (
                <div key={d.day_offset} className="flex items-center justify-between text-sm px-2 py-1.5 hover:bg-cream-50 rounded-md">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] bg-cream-100 px-1.5 py-0.5 rounded">
                      D{d.day_offset >= 0 ? `+${d.day_offset}` : d.day_offset}
                    </span>
                    <span className="text-xs text-muted-foreground w-24">{DAY_KIND_LABELS[d.day_kind] ?? d.day_kind}</span>
                    <span>{d.from_place}{d.to_place ? ` → ${d.to_place}` : ""}</span>
                    {d.km && <span className="text-xs text-muted-foreground">· {d.km} km</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDate(d.date)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-camino-yellow border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-camino-deepYellow" /> Aplicar plantilla de la ruta</CardTitle>
          <CardDescription>
            Crea automáticamente los viáticos del equipo (vuelos, hoteles Madrid/Oporto, comidas) y los items por peregrino (mochilas, materiales, vino, credenciales, seguro) con valores base. Lo afinás en los siguientes pasos.
            {hasItems && <span className="block text-amber-700 mt-1">⚠ Ya hay items cargados. Aplicar solo agrega los que falten.</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!departure.route_id && (
            <div className="text-sm text-amber-700 mb-2">⚠ Primero asigná la ruta arriba y tocá "Guardar datos básicos".</div>
          )}
          {departure.route_id && !startDate && (
            <div className="text-sm text-amber-700 mb-2">⚠ Falta la fecha de inicio.</div>
          )}
          <Button variant="accent" onClick={onApplyTemplate} disabled={applying || !startDate || !departure.route_id}>
            <Sparkles className="h-4 w-4" /> {applying ? "Aplicando..." : hasItems ? "Aplicar items faltantes" : "Aplicar plantilla"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
