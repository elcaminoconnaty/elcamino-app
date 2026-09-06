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
import { Sparkles, Calendar, FileSignature } from "lucide-react";
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
  const [bufferPct, setBufferPct] = useState(String(departure.variable_buffer_pct ?? ""));
  // Datos que solo usa el contrato. Las fechas van aparte de las de operación porque en los
  // dos contratos ya firmados no coinciden: Sept-2026 opera del 28/09 al 06/10 y el contrato
  // dice del 27/09 al 04/10.
  const [contratoInicio, setContratoInicio] = useState(departure.contract_start_date ?? "");
  const [contratoFin, setContratoFin] = useState(departure.contract_end_date ?? "");
  const [origen, setOrigen] = useState(departure.origin_city ?? "");
  const [destino, setDestino] = useState(departure.destination_city ?? "");
  const [planNombre, setPlanNombre] = useState(departure.contract_plan_name ?? "");
  const [brochureUrl, setBrochureUrl] = useState(departure.brochure_url ?? "");
  const [guardandoContrato, setGuardandoContrato] = useState(false);
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
    fd.set("variable_buffer_pct", bufferPct || "0");
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

  async function guardarDatosDelContrato() {
    setGuardandoContrato(true);
    const fd = new FormData();
    // `updateDeparture` reescribe estos campos siempre, así que hay que mandarlos todos.
    fd.set("name", name);
    fd.set("start_date", startDate);
    if (endDate) fd.set("end_date", endDate);
    if (capacity) fd.set("capacity", capacity);
    fd.set("base_price_eur", basePrice || "0");
    fd.set("status", departure.status);
    if (routeId) fd.set("route_id", routeId);
    fd.set("contract_start_date", contratoInicio);
    fd.set("contract_end_date", contratoFin);
    fd.set("origin_city", origen);
    fd.set("destination_city", destino);
    fd.set("contract_plan_name", planNombre);
    fd.set("brochure_url", brochureUrl);
    try {
      await updateDeparture(departure.id, fd);
      toast({ title: "Datos del contrato guardados", variant: "success" });
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setGuardandoContrato(false);
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
              <p className="text-xs text-aviso-700">⚠ Este camino no tiene ruta asignada. Elegí una y tocá "Guardar".</p>
            )}
            {hasRouteMismatch && (
              <p className="text-xs text-aviso-700">Hay un cambio pendiente — tocá "Guardar datos básicos" para confirmar.</p>
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
          <div className="grid gap-2">
            <Label>% de contingencia sobre costos variables por persona</Label>
            <Input type="number" step="0.5" min={0} value={bufferPct} onChange={(e) => setBufferPct(e.target.value)} placeholder="0" />
            <p className="text-xs text-muted-foreground">
              Sube un % los costos que escalan por persona (camas, cenas, materiales, seguros…). No toca el fijo de grupo ni los viáticos del equipo.
              Es tu colchón sobre el costo por peregrino. Solo se edita acá, en el wizard.
            </p>
          </div>
          <Button variant="accent" onClick={saveBasics} disabled={saving}>{saving ? "Guardando..." : "Guardar datos básicos"}</Button>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSignature className="h-4 w-4" /> Datos para el contrato</CardTitle>
          <CardDescription>
            Lo que el contrato dice de este camino. Se guarda aparte de lo operativo porque no
            siempre coincide: en los dos contratos ya firmados las fechas difieren de las de
            operación en uno o varios días.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Fecha de inicio según el contrato</Label>
              <Input type="date" value={contratoInicio} onChange={(e) => setContratoInicio(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Fecha de fin según el contrato</Label>
              <Input type="date" value={contratoFin} onChange={(e) => setContratoFin(e.target.value)} />
            </div>
          </div>
          {(!contratoInicio || !contratoFin) && (
            <p className="text-xs text-aviso-700">
              Si las dejás vacías, el contrato usa las fechas de operación
              {startDate ? ` (${formatDate(startDate)}${endDate ? ` a ${formatDate(endDate)}` : ""})` : ""} y avisa en la tarjeta del peregrino.
            </p>
          )}
          <div className="grid gap-2">
            <Label>Nombre del plan, tal como debe leerse en el contrato</Label>
            <Input value={planNombre} onChange={(e) => setPlanNombre(e.target.value)} placeholder="EL CAMINO DE SANTIAGO FRANCÉS" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Ciudad de origen</Label>
              <Input value={origen} onChange={(e) => setOrigen(e.target.value)} placeholder="MADRID" />
            </div>
            <div className="grid gap-2">
              <Label>Ciudad de destino</Label>
              <Input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="SANTIAGO DE COMPOSTELA" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Enlace a las condiciones del viaje (Anexo No. 1)</Label>
            <Input value={brochureUrl} onChange={(e) => setBrochureUrl(e.target.value)} placeholder="https://…" />
            <p className="text-xs text-muted-foreground">
              El contrato lo cita en la cláusula 1. Por ahora es el PDF de Google Drive; cuando
              exista la página del viaje en la plataforma, va esa.
            </p>
          </div>
          <Button variant="accent" onClick={guardarDatosDelContrato} disabled={guardandoContrato}>
            {guardandoContrato ? "Guardando..." : "Guardar datos del contrato"}
          </Button>
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
                <div key={d.day_offset} className="flex items-center justify-between text-sm px-2 py-1.5 hover:bg-alba rounded-md">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] bg-piedra-suave px-1.5 py-0.5 rounded">
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

      <Card className="border-ocre border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-ocre-profundo" /> Aplicar plantilla de la ruta</CardTitle>
          <CardDescription>
            Crea automáticamente los viáticos del equipo (vuelos, hoteles Madrid/Oporto, comidas) y los items por peregrino (mochilas, materiales, vino, credenciales, seguro) con valores base. Lo afinás en los siguientes pasos.
            {hasItems && <span className="block text-aviso-700 mt-1">⚠ Ya hay items cargados. Aplicar solo agrega los que falten.</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!departure.route_id && (
            <div className="text-sm text-aviso-700 mb-2">⚠ Primero asigná la ruta arriba y tocá "Guardar datos básicos".</div>
          )}
          {departure.route_id && !startDate && (
            <div className="text-sm text-aviso-700 mb-2">⚠ Falta la fecha de inicio.</div>
          )}
          <Button variant="accent" onClick={onApplyTemplate} disabled={applying || !startDate || !departure.route_id}>
            <Sparkles className="h-4 w-4" /> {applying ? "Aplicando..." : hasItems ? "Aplicar items faltantes" : "Aplicar plantilla"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
