"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createReservation } from "@/lib/actions/reservations";
import { setReservationRooms } from "@/lib/actions/reservation-rooms";
import type { RoomInput } from "@/lib/data/rooms";
import { RoomsEditor } from "@/components/departures/rooms-editor";
import { RESERVATION_STATUSES, PROVIDER_TYPES } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { Plus } from "lucide-react";
import { formatEUR } from "@/lib/utils";

export function AddReservation({ departureId, providers, defaultType }: { departureId: string; providers: any[]; defaultType?: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>(defaultType ?? "alojamiento");
  const [rooms, setRooms] = useState<RoomInput[]>([]);
  const [roomTotals, setRoomTotals] = useState({ beds: 0, cost: 0 });
  const [mealPersons, setMealPersons] = useState("");
  const [mealPrice, setMealPrice] = useState("");
  const [pricingMode, setPricingMode] = useState<"total" | "per_person">("total");
  const [servicePersons, setServicePersons] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [transportTotal, setTransportTotal] = useState("");
  const [touristTax, setTouristTax] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const router = useRouter();

  const isMeal = type === "cenas";
  const isTransport = type === "transporte";
  const isLodging = !isMeal && !isTransport;

  const mealTotal = (Number(mealPersons) || 0) * (Number(mealPrice) || 0);
  const transportComputed = pricingMode === "per_person"
    ? (Number(servicePersons) || 0) * (Number(servicePrice) || 0)
    : (Number(transportTotal) || 0);

  function resetAll() {
    setRooms([]); setRoomTotals({ beds: 0, cost: 0 });
    setType(defaultType ?? "alojamiento");
    setMealPersons(""); setMealPrice("");
    setPricingMode("total"); setServicePersons(""); setServicePrice(""); setTransportTotal("");
    setTouristTax(""); setCheckIn(""); setCheckOut("");
  }

  // Cálculo de noches y total tasa turística
  const nights = (() => {
    if (!checkIn || !checkOut) return 1;
    const a = new Date(checkIn);
    const b = new Date(checkOut);
    const d = Math.round((b.getTime() - a.getTime()) / 86_400_000);
    return Math.max(1, d);
  })();
  const taxBeds = isLodging ? (rooms.length > 0 ? roomTotals.beds : 0) : 0;
  const taxTotal = (Number(touristTax) || 0) * nights * taxBeds;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetAll(); }}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus className="h-4 w-4" /> Nueva reserva</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Nueva reserva</DialogTitle></DialogHeader>
        <form
          action={async (fd) => {
            try {
              fd.set("type", type);
              if (isMeal) {
                const persons = Number(mealPersons) || 0;
                const price = Number(mealPrice) || 0;
                const total = persons * price;
                fd.set("beds_count", String(persons));
                fd.set("estimated_cost_eur", String(total));
                if (["reservado","pagado"].includes(fd.get("status")?.toString() || "")) {
                  fd.set("confirmed_cost_eur", String(total));
                }
                fd.set("meal_persons", String(persons));
                fd.set("meal_price_per_person_eur", String(price));
                fd.set("pricing_mode", "per_person");
              } else if (isTransport) {
                const persons = Number(servicePersons) || 0;
                const price = Number(servicePrice) || 0;
                const total = pricingMode === "per_person" ? persons * price : Number(transportTotal) || 0;
                if (pricingMode === "per_person") {
                  fd.set("beds_count", String(persons));
                  fd.set("service_persons", String(persons));
                  fd.set("service_price_per_person_eur", String(price));
                }
                fd.set("estimated_cost_eur", String(total));
                if (["reservado","pagado"].includes(fd.get("status")?.toString() || "")) {
                  fd.set("confirmed_cost_eur", String(total));
                }
                fd.set("pricing_mode", pricingMode);
              } else if (rooms.length > 0) {
                fd.set("beds_count", String(roomTotals.beds));
                const taxRate = Number(touristTax) || 0;
                const taxTotalFinal = taxRate * roomTotals.beds * nights;
                const totalCost = roomTotals.cost + taxTotalFinal;
                fd.set("estimated_cost_eur", String(totalCost));
                if (["reservado","pagado"].includes(fd.get("status")?.toString() || "")) {
                  fd.set("confirmed_cost_eur", String(totalCost));
                }
              }
              if (isLodging) {
                fd.set("tourist_tax_per_person_eur", String(Number(touristTax) || 0));
                // Si es lodging manual (no rooms), sumar la tasa al costo manual ingresado
                if (rooms.length === 0) {
                  const taxRate = Number(touristTax) || 0;
                  const bedsManual = Number(fd.get("beds_count") || 0);
                  const taxTotalFinal = taxRate * bedsManual * nights;
                  if (taxTotalFinal > 0) {
                    const baseEst = Number(fd.get("estimated_cost_eur") || 0);
                    fd.set("estimated_cost_eur", String(baseEst + taxTotalFinal));
                    const baseConf = fd.get("confirmed_cost_eur");
                    if (baseConf) {
                      fd.set("confirmed_cost_eur", String(Number(baseConf) + taxTotalFinal));
                    }
                  }
                }
              }
              fd.set("departure_id", departureId);
              const created = await createReservation(fd);
              if (isLodging && rooms.length > 0 && (created as any)?.id) {
                await setReservationRooms((created as any).id, rooms, departureId);
              }
              toast({ title: "Reserva creada", variant: "success" });
              setOpen(false);
              resetAll();
              router.refresh();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
          }}
          className="space-y-3 max-h-[75vh] overflow-y-auto pr-1"
        >
          <div className="grid gap-2">
            <Label>Proveedor *</Label>
            <select name="provider_id" required className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Seleccionar —</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Tipo</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid gap-2"><Label>Lugar</Label><Input name="location" placeholder="Sarria / Madrid / Santiago" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label>Día camino</Label><Input name="day_number" type="number" /></div>
            <div className="grid gap-2"><Label>{isTransport ? "Fecha servicio" : "Check-in / fecha"}</Label><Input name="check_in" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Check-out (si aplica)</Label><Input name="check_out" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
          </div>

          {isMeal && (
            <div className="rounded-md border bg-aviso-50/40 p-3 space-y-3">
              <Label className="text-sm font-medium">🍽 Detalle de la comida</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <select name="meal_kind" defaultValue="cena" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="desayuno">Desayuno</option>
                    <option value="almuerzo">Almuerzo</option>
                    <option value="cena">Cena</option>
                    <option value="snack">Snack</option>
                  </select>
                </div>
                <div><Label className="text-xs">Personas</Label><Input type="number" min={1} value={mealPersons} onChange={(e) => setMealPersons(e.target.value)} /></div>
                <div><Label className="text-xs">€ / persona</Label><Input type="number" step="0.01" value={mealPrice} onChange={(e) => setMealPrice(e.target.value)} /></div>
              </div>
              <div className="text-sm text-muted-foreground">Total estimado: <strong className="text-foreground">{formatEUR(mealTotal)}</strong></div>
            </div>
          )}

          {isTransport && (
            <div className="rounded-md border bg-info-50/40 p-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-sm font-medium">🚌 Detalle del transporte</Label>
                <div className="flex gap-1 text-xs">
                  <button type="button" onClick={() => setPricingMode("total")} className={`px-3 py-1 rounded-md ${pricingMode === "total" ? "bg-ocre text-noche font-medium" : "bg-piedra-suave text-muted-foreground"}`}>Total fijo (privado)</button>
                  <button type="button" onClick={() => setPricingMode("per_person")} className={`px-3 py-1 rounded-md ${pricingMode === "per_person" ? "bg-ocre text-noche font-medium" : "bg-piedra-suave text-muted-foreground"}`}>Por persona (tren)</button>
                </div>
              </div>
              {pricingMode === "total" ? (
                <div>
                  <Label className="text-xs">Costo total (EUR)</Label>
                  <Input type="number" step="0.01" value={transportTotal} onChange={(e) => setTransportTotal(e.target.value)} placeholder="Ej. bus privado a Finisterre" />
                  <div className="text-xs text-muted-foreground mt-1">El costo no escala con peregrinos (es total fijo).</div>
                </div>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div><Label className="text-xs">Personas</Label><Input type="number" min={1} value={servicePersons} onChange={(e) => setServicePersons(e.target.value)} /></div>
                    <div><Label className="text-xs">€ / persona</Label><Input type="number" step="0.01" value={servicePrice} onChange={(e) => setServicePrice(e.target.value)} placeholder="Ej. tren Madrid-Sarria" /></div>
                  </div>
                  <div className="text-xs text-muted-foreground">El costo escala con inscritos. Cada peregrino paga su tiquete.</div>
                </>
              )}
              <div className="text-sm">Total: <strong>{formatEUR(transportComputed)}</strong></div>
            </div>
          )}

          {isLodging && (
            <>
              <RoomsEditor
                initial={[]}
                onChange={(rs, totals) => { setRooms(rs); setRoomTotals(totals); }}
              />
              <div className="rounded-md border bg-alba p-3 space-y-2">
                <Label className="text-sm font-medium">🏛 Tasa turística (opcional)</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">€ por persona / noche</Label>
                    <Input type="number" step="0.01" min={0} value={touristTax} onChange={(e) => setTouristTax(e.target.value)} placeholder="Ej. 2.50" />
                  </div>
                  <div className="text-xs text-muted-foreground self-end pb-2">
                    {taxTotal > 0 ? (
                      <>+ <strong className="text-foreground">{formatEUR(taxTotal)}</strong> ({taxBeds || "?"} personas × {nights} noche{nights > 1 ? "s" : ""}) — incluido en el costo de la reserva.</>
                    ) : (
                      <>Se suma al costo total de la reserva (no es ítem aparte).</>
                    )}
                  </div>
                </div>
              </div>
              {rooms.length === 0 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2"><Label>Plazas (manual)</Label><Input name="beds_count" type="number" min={1} /></div>
                    <div className="grid gap-2"><Label>Acomodación libre</Label><Input name="accommodation_type" /></div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2"><Label>Costo estimado (EUR)</Label><Input name="estimated_cost_eur" type="number" step="0.01" /></div>
                    <div className="grid gap-2"><Label>Costo confirmado (EUR)</Label><Input name="confirmed_cost_eur" type="number" step="0.01" /></div>
                  </div>
                </>
              )}
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Estado</Label>
              <select name="status" defaultValue="presupuestado" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {RESERVATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="grid gap-2"><Label>Ref. confirmación</Label><Input name="confirmation_ref" /></div>
          </div>
          <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" rows={2} /></div>
          <DialogFooter>
            <Button type="submit" variant="accent">Crear</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
