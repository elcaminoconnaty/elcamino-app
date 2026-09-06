"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateReservation, deleteReservation, createProviderPayment } from "@/lib/actions/reservations";
import { getReservationPayments } from "@/lib/actions/provider-payments";
import { setReservationRooms, getReservationRooms } from "@/lib/actions/reservation-rooms";
import { getReservationSchedule, setReservationSchedule } from "@/lib/actions/reservation-schedule";
import type { RoomInput } from "@/lib/data/rooms";
import { RoomsEditor } from "@/components/departures/rooms-editor";
import { ReservationPaymentScheduleEditor, type ScheduleItem } from "@/components/departures/reservation-payment-schedule-editor";
import { RESERVATION_STATUSES, PROVIDER_TYPES, PAYMENT_METHODS, ACCOUNTS } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import { formatEUR } from "@/lib/utils";
import { Pencil, Trash2, AlertTriangle, CreditCard } from "lucide-react";

export function EditReservationDialog({ reservation, providers, departureId, triggerLabel }: { reservation: any; providers: any[]; departureId: string; triggerLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [type, setType] = useState<string>(reservation.type);
  const [isCritical, setIsCritical] = useState<boolean>(!!reservation.is_critical);
  const [rooms, setRooms] = useState<RoomInput[]>([]);
  const [roomsInitial, setRoomsInitial] = useState<any[] | null>(null);
  const [roomTotals, setRoomTotals] = useState({ beds: 0, cost: 0 });

  const [mealPersons, setMealPersons] = useState(reservation.meal_persons != null ? String(reservation.meal_persons) : "");
  const [mealPrice, setMealPrice] = useState(reservation.meal_price_per_person_eur != null ? String(reservation.meal_price_per_person_eur) : "");

  const [pricingMode, setPricingMode] = useState<"total" | "per_person">(reservation.pricing_mode ?? "total");
  const [servicePersons, setServicePersons] = useState(reservation.service_persons != null ? String(reservation.service_persons) : "");
  const [servicePrice, setServicePrice] = useState(reservation.service_price_per_person_eur != null ? String(reservation.service_price_per_person_eur) : "");
  const [transportTotal, setTransportTotal] = useState(
    reservation.confirmed_cost_eur != null ? String(reservation.confirmed_cost_eur) :
    reservation.estimated_cost_eur != null ? String(reservation.estimated_cost_eur) : ""
  );
  const [touristTax, setTouristTax] = useState(
    reservation.tourist_tax_per_person_eur != null ? String(reservation.tourist_tax_per_person_eur) : ""
  );
  const [checkIn, setCheckIn] = useState(reservation.check_in ?? "");
  const [checkOut, setCheckOut] = useState(reservation.check_out ?? "");
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [scheduleInitial, setScheduleInitial] = useState<ScheduleItem[] | null>(null);

  // Estado + registro del pago real al marcar la reserva como pagada
  const [status, setStatus] = useState<string>(reservation.status);
  const [paidTotal, setPaidTotal] = useState<number | null>(null);
  const [registrarPago, setRegistrarPago] = useState(true);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState<"EUR" | "COP" | "USD">("EUR");
  const [payTrm, setPayTrm] = useState("");
  const [payUsdRate, setPayUsdRate] = useState("");
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0]);
  const [payAccount, setPayAccount] = useState(ACCOUNTS[0]);

  const router = useRouter();
  const isMeal = type === "cenas";
  const isTransport = type === "transporte";
  const isLodging = !isMeal && !isTransport;

  const nights = (() => {
    if (!checkIn || !checkOut) return 1;
    const a = new Date(checkIn);
    const b = new Date(checkOut);
    const d = Math.round((b.getTime() - a.getTime()) / 86_400_000);
    return Math.max(1, d);
  })();
  const taxBeds = isLodging ? (rooms.length > 0 ? roomTotals.beds : (Number(reservation.beds_count) || 0)) : 0;
  const taxTotal = (Number(touristTax) || 0) * nights * taxBeds;

  const mealTotal = (Number(mealPersons) || 0) * (Number(mealPrice) || 0);
  const transportComputed = pricingMode === "per_person"
    ? (Number(servicePersons) || 0) * (Number(servicePrice) || 0)
    : (Number(transportTotal) || 0);

  useEffect(() => {
    if (open && roomsInitial === null) {
      getReservationRooms(reservation.id).then((data) => setRoomsInitial(data ?? []));
    }
    if (open && scheduleInitial === null) {
      getReservationSchedule(reservation.id).then((data) => {
        const items: ScheduleItem[] = (data ?? []).map((s: any) => ({
          id: s.id,
          due_date: s.due_date,
          amount_eur: Number(s.amount_eur),
          label: s.label ?? "",
          notes: s.notes ?? "",
          paid: !!s.paid,
          paid_at: s.paid_at,
          provider_payment_id: s.provider_payment_id,
        }));
        setScheduleInitial(items);
        setSchedule(items);
      });
    }
    if (open && paidTotal === null) {
      getReservationPayments(reservation.id).then((data) =>
        setPaidTotal((data ?? []).reduce((s: number, p: any) => s + Number(p.amount_eur || 0), 0))
      );
    }
    if (!open) {
      setRoomsInitial(null);
      setRooms([]);
      setScheduleInitial(null);
      setSchedule([]);
      setPaidTotal(null);
      setStatus(reservation.status);
      setPayAmount("");
    }
  }, [open, reservation.id, reservation.status, roomsInitial, scheduleInitial, paidTotal]);

  const currentCost = (() => {
    if (isMeal) return mealTotal;
    if (isTransport) return transportComputed;
    if (rooms.length > 0) return roomTotals.cost;
    return Number(reservation.confirmed_cost_eur ?? reservation.estimated_cost_eur ?? 0);
  })();

  const saldoReserva = Math.max(0, currentCost - (paidTotal ?? 0));
  const goingToPaid = status === "pagado" && reservation.status !== "pagado";
  const mostrarBloquePago = goingToPaid && paidTotal !== null && saldoReserva > 0.01;

  useEffect(() => {
    if (mostrarBloquePago && payAmount === "") setPayAmount(saldoReserva.toFixed(2));
  }, [mostrarBloquePago, saldoReserva, payAmount]);

  async function onDelete() {
    if (!confirm("¿Eliminar esta reserva?")) return;
    setDeleting(true);
    try {
      await deleteReservation(reservation.id, departureId);
      toast({ title: "Reserva eliminada", variant: "success" });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeleting(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerLabel ? (
          <Button variant="outline" size="sm"><Pencil className="h-3.5 w-3.5" /> {triggerLabel}</Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Pencil className="h-3.5 w-3.5" /></Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Editar reserva</DialogTitle></DialogHeader>
        <form
          action={async (fd) => {
            const registraElPago = mostrarBloquePago && registrarPago;
            if (registraElPago) {
              if (!Number(payAmount) || Number(payAmount) <= 0) {
                toast({ title: "Monto del pago inválido", variant: "destructive" });
                return;
              }
              if (payCurrency === "USD" && (!Number(payUsdRate) || Number(payUsdRate) <= 0)) {
                toast({ title: "Falta la tasa USD→EUR", variant: "destructive" });
                return;
              }
            }
            setSaving(true);
            try {
              const useRoomsTotals = isLodging && rooms.length > 0;
              const personsM = Number(mealPersons) || 0;
              const priceM = Number(mealPrice) || 0;
              const personsT = Number(servicePersons) || 0;
              const priceT = Number(servicePrice) || 0;
              const totalT = pricingMode === "per_person" ? personsT * priceT : Number(transportTotal) || 0;

              const payload: any = {
                provider_id: fd.get("provider_id"),
                type,
                location: fd.get("location")?.toString() || null,
                day_number: fd.get("day_number") ? Number(fd.get("day_number")) : null,
                check_in: fd.get("check_in")?.toString() || null,
                check_out: fd.get("check_out")?.toString() || null,
                status: fd.get("status"),
                confirmation_ref: fd.get("confirmation_ref")?.toString() || null,
                is_critical: isCritical,
                notes: fd.get("notes")?.toString() || null,
              };

              if (isMeal) {
                payload.beds_count = personsM;
                payload.estimated_cost_eur = personsM * priceM;
                payload.confirmed_cost_eur = personsM * priceM;
                payload.meal_kind = fd.get("meal_kind")?.toString() || "cena";
                payload.meal_persons = personsM;
                payload.meal_price_per_person_eur = priceM;
                payload.pricing_mode = "per_person";
              } else if (isTransport) {
                payload.beds_count = pricingMode === "per_person" ? personsT : null;
                payload.estimated_cost_eur = totalT;
                payload.confirmed_cost_eur = totalT;
                payload.pricing_mode = pricingMode;
                payload.service_persons = pricingMode === "per_person" ? personsT : null;
                payload.service_price_per_person_eur = pricingMode === "per_person" ? priceT : null;
                payload.meal_kind = null;
                payload.meal_persons = null;
                payload.meal_price_per_person_eur = null;
              } else {
                payload.accommodation_type = fd.get("accommodation_type")?.toString() || null;
                payload.check_in_time = fd.get("check_in_time")?.toString() || null;
                payload.breakfast_time = fd.get("breakfast_time")?.toString() || null;
                payload.beds_count = useRoomsTotals ? roomTotals.beds : (fd.get("beds_count") ? Number(fd.get("beds_count")) : null);
                const baseCost = useRoomsTotals ? roomTotals.cost : Number(fd.get("estimated_cost_eur") || 0);
                const baseConfirmed = useRoomsTotals
                  ? roomTotals.cost
                  : (fd.get("confirmed_cost_eur") ? Number(fd.get("confirmed_cost_eur")) : null);
                const taxRate = Number(touristTax) || 0;
                const taxTotalFinal = taxRate * (payload.beds_count || 0) * nights;
                payload.estimated_cost_eur = baseCost + taxTotalFinal;
                payload.confirmed_cost_eur = baseConfirmed != null ? baseConfirmed + taxTotalFinal : null;
                payload.pricing_mode = "total";
                payload.tourist_tax_per_person_eur = taxRate;
              }

              await updateReservation(reservation.id, payload, departureId);
              if (isLodging) {
                await setReservationRooms(reservation.id, rooms, departureId);
              }
              await setReservationSchedule(reservation.id, schedule.map((s, i) => ({
                id: s.id,
                due_date: s.due_date,
                amount_eur: s.amount_eur,
                label: s.label || null,
                notes: s.notes || null,
                paid: s.paid,
                paid_at: s.paid_at,
                provider_payment_id: s.provider_payment_id,
                position: i,
              })), departureId);
              if (registraElPago) {
                const pfd = new FormData();
                pfd.set("provider_id", fd.get("provider_id")?.toString() || reservation.provider_id);
                pfd.set("reservation_id", reservation.id);
                pfd.set("departure_id", departureId);
                pfd.set("paid_at", payDate);
                pfd.set("amount", payAmount);
                pfd.set("currency", payCurrency);
                if (payCurrency === "COP" && payTrm) pfd.set("trm_eur_cop", payTrm);
                if (payCurrency === "USD") pfd.set("usd_eur_rate", payUsdRate);
                pfd.set("method", payMethod);
                pfd.set("account", payAccount);
                pfd.set("notes", "Registrado al marcar la reserva como pagada");
                await createProviderPayment(pfd);
                toast({ title: "Guardado y pago registrado en gastos", variant: "success" });
              } else {
                toast({ title: "Guardado", variant: "success" });
              }
              setOpen(false);
              router.refresh();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
            setSaving(false);
          }}
          className="space-y-3 max-h-[75vh] overflow-y-auto pr-1"
        >
          <div className="grid gap-2">
            <Label>Proveedor</Label>
            <select name="provider_id" defaultValue={reservation.provider_id} required className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Tipo</Label>
              <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid gap-2"><Label>Lugar</Label><Input name="location" defaultValue={reservation.location ?? ""} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label>Día del camino</Label><Input name="day_number" type="number" defaultValue={reservation.day_number ?? ""} /></div>
            <div className="grid gap-2"><Label>{isTransport ? "Fecha servicio" : "Check-in / fecha"}</Label><Input name="check_in" type="date" value={checkIn ?? ""} onChange={(e) => setCheckIn(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Check-out</Label><Input name="check_out" type="date" value={checkOut ?? ""} onChange={(e) => setCheckOut(e.target.value)} /></div>
          </div>

          {isMeal && (
            <div className="rounded-md border bg-aviso-50/40 p-3 space-y-3">
              <Label className="text-sm font-medium">Detalle de la comida</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                <div><Label className="text-xs">Tipo</Label>
                  <select name="meal_kind" defaultValue={reservation.meal_kind ?? "cena"} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="desayuno">Desayuno</option><option value="almuerzo">Almuerzo</option><option value="cena">Cena</option><option value="snack">Snack</option>
                  </select>
                </div>
                <div><Label className="text-xs">Personas</Label><Input type="number" min={1} value={mealPersons} onChange={(e) => setMealPersons(e.target.value)} /></div>
                <div><Label className="text-xs">€ / persona</Label><Input type="number" step="0.01" value={mealPrice} onChange={(e) => setMealPrice(e.target.value)} /></div>
              </div>
              <div className="text-sm text-muted-foreground">Total: <strong className="text-foreground">{formatEUR(mealTotal)}</strong></div>
            </div>
          )}

          {isTransport && (
            <div className="rounded-md border bg-info-50/40 p-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-sm font-medium">Detalle del transporte</Label>
                <div className="flex gap-1 text-xs">
                  <button type="button" onClick={() => setPricingMode("total")} className={`px-3 py-1 rounded-md ${pricingMode === "total" ? "bg-ocre text-noche font-medium" : "bg-piedra-suave text-muted-foreground"}`}>Total fijo (privado)</button>
                  <button type="button" onClick={() => setPricingMode("per_person")} className={`px-3 py-1 rounded-md ${pricingMode === "per_person" ? "bg-ocre text-noche font-medium" : "bg-piedra-suave text-muted-foreground"}`}>Por persona (tren)</button>
                </div>
              </div>
              {pricingMode === "total" ? (
                <div><Label className="text-xs">Costo total (EUR)</Label>
                  <Input type="number" step="0.01" value={transportTotal} onChange={(e) => setTransportTotal(e.target.value)} placeholder="Ej. transporte privado a Finisterre" />
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div><Label className="text-xs">Personas</Label><Input type="number" min={1} value={servicePersons} onChange={(e) => setServicePersons(e.target.value)} /></div>
                  <div><Label className="text-xs">€ / persona</Label><Input type="number" step="0.01" value={servicePrice} onChange={(e) => setServicePrice(e.target.value)} /></div>
                </div>
              )}
              <div className="text-sm text-muted-foreground">Total: <strong className="text-foreground">{formatEUR(transportComputed)}</strong></div>
            </div>
          )}

          {isLodging && roomsInitial !== null && (
            <RoomsEditor
              key={`rooms-${reservation.id}`}
              initial={roomsInitial}
              onChange={(rs, totals) => { setRooms(rs); setRoomTotals(totals); }}
            />
          )}

          {isLodging && (
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
                    <>Se suma al costo total de la reserva (no es item aparte).</>
                  )}
                </div>
              </div>
            </div>
          )}

          {isLodging && roomsInitial !== null && rooms.length === 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2"><Label>Plazas (manual)</Label><Input name="beds_count" type="number" defaultValue={reservation.beds_count ?? ""} /></div>
                <div className="grid gap-2">
                  <Label>Acomodación libre</Label>
                  <Input name="accommodation_type" defaultValue={reservation.accommodation_type ?? ""} placeholder="Se deduce de las habitaciones" />
                </div>
              </div>
              {/* Horas de ESTE grupo. En blanco se usan las del hotel, que están en su ficha
                  de proveedor y sirven para todos los caminos. */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Hora de entrada, solo este grupo</Label>
                  <Input name="check_in_time" defaultValue={reservation.check_in_time ?? ""} placeholder="La del hotel" />
                </div>
                <div className="grid gap-2">
                  <Label>Hora del desayuno, solo este grupo</Label>
                  <Input name="breakfast_time" defaultValue={reservation.breakfast_time ?? ""} placeholder="La del hotel" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2"><Label>Costo estimado (EUR)</Label><Input name="estimated_cost_eur" type="number" step="0.01" defaultValue={reservation.estimated_cost_eur} /></div>
                <div className="grid gap-2"><Label>Costo confirmado (EUR)</Label><Input name="confirmed_cost_eur" type="number" step="0.01" defaultValue={reservation.confirmed_cost_eur ?? ""} /></div>
              </div>
            </>
          )}

          {scheduleInitial !== null && (
            <ReservationPaymentScheduleEditor
              initial={scheduleInitial}
              totalCost={currentCost}
              onChange={setSchedule}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Estado</Label>
              <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {RESERVATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="grid gap-2"><Label>Ref. confirmación</Label><Input name="confirmation_ref" defaultValue={reservation.confirmation_ref ?? ""} /></div>
          </div>

          {goingToPaid && paidTotal !== null && saldoReserva <= 0.01 && (
            <div className="rounded-md border border-ok-200 bg-ok-50 p-3 text-xs text-ok-900">
              Esta reserva ya tiene el 100% pagado registrado ({formatEUR(paidTotal)}). Solo se actualiza el estado.
            </div>
          )}

          {mostrarBloquePago && (
            <div className="rounded-md border border-ok-200 bg-ok-50/60 p-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="checkbox" checked={registrarPago} onChange={(e) => setRegistrarPago(e.target.checked)} />
                  <CreditCard className="h-4 w-4" /> Registrar el pago del saldo en gastos
                </label>
                <span className="text-xs text-muted-foreground">Saldo: <strong className="text-foreground">{formatEUR(saldoReserva)}</strong> (pagado {formatEUR(paidTotal ?? 0)})</span>
              </div>
              {registrarPago ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="grid gap-1.5"><Label className="text-xs">Fecha</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
                    <div className="grid gap-1.5"><Label className="text-xs">Monto</Label><Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
                    <div className="grid gap-1.5"><Label className="text-xs">Divisa</Label>
                      <select value={payCurrency} onChange={(e) => setPayCurrency(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                        <option value="EUR">EUR</option><option value="COP">COP</option>
                      </select>
                    </div>
                  </div>
                  {payCurrency === "COP" && (
                    <div className="grid gap-1.5"><Label className="text-xs">TRM (COP por EUR)</Label><Input type="number" step="0.01" value={payTrm} onChange={(e) => setPayTrm(e.target.value)} placeholder="Vacío = TRM del día" /></div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-1.5"><Label className="text-xs">Método</Label>
                      <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                        {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="grid gap-1.5"><Label className="text-xs">Cuenta (de dónde sale)</Label>
                      <select value={payAccount} onChange={(e) => setPayAccount(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                        {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Queda como pago al proveedor, conectado a gastos, saldos por cuenta y dashboard.</p>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">Solo se marca el estado, sin registrar plata (usalo si el pago ya está cargado).</p>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-md bg-aviso-50 border border-aviso-200">
            <input type="checkbox" checked={isCritical} onChange={(e) => setIsCritical(e.target.checked)} />
            <AlertTriangle className="h-4 w-4 text-aviso-700" />
            <span>Marcar como crítica</span>
          </label>
          <div className="grid gap-2"><Label>Notas</Label><Textarea name="notes" defaultValue={reservation.notes ?? ""} rows={3} /></div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button type="button" variant="destructive" size="sm" onClick={onDelete} disabled={deleting}>
              <Trash2 className="h-4 w-4" /> {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="accent" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
