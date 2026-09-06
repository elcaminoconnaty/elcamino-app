import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";

type Alert = { kind: string; title: string; detail?: string; sortDate?: string };

const KIND_ORDER = [
  "payment_overdue",
  "payment_due_soon",
  "critical",
  "capacity_low",
  "capacity_high",
  "odd_double",
  "missing_breakfast",
  "missing_dinner",
  "needs_reservation",
  "needs_send",
  "needs_confirm",
];

const TYPE_TO_CATEGORY: Record<string, string> = {
  alojamiento: "Alojamiento",
  cenas: "Cenas",
  transporte: "Transporte",
};

export async function CriticalAlertsBanner({ departureId, inscritosTotal }: { departureId: string; inscritosTotal: number }) {
  const supabase = createClient();
  const [
    { data: reservations },
    { data: rooms },
    { data: budgetItems },
    { data: finance },
    { data: mealCoverage },
    { data: scheduleRows },
  ] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, type, location, day_number, check_in, beds_count, notes, status, is_critical, provider_id, providers(name), meal_kind")
      .eq("departure_id", departureId)
      .order("check_in", { ascending: true, nullsFirst: false }),
    supabase.from("reservation_rooms").select("reservation_id, room_type, rooms_count, capacity_per_room"),
    supabase
      .from("budget_items")
      .select("id, description, status, scaling, category, reservation_id, item_date, provider_id")
      .eq("departure_id", departureId)
      .neq("status", "cancelado")
      .order("item_date", { ascending: true, nullsFirst: false }),
    supabase.from("v_departure_finance").select("inscritos_total").eq("departure_id", departureId).maybeSingle(),
    supabase.from("v_meal_coverage").select("*").eq("departure_id", departureId).order("day_date", { ascending: true }),
    supabase
      .from("v_reservation_schedule")
      .select("*, providers:provider_id(name)")
      .eq("departure_id", departureId)
      .eq("paid", false)
      .order("due_date", { ascending: true }),
  ]);

  const inscritos = Number((finance as any)?.inscritos_total ?? inscritosTotal ?? 0);
  const alerts: Alert[] = [];

  const roomsByRes = new Map<string, any[]>();
  (rooms ?? []).forEach((r: any) => {
    const arr = roomsByRes.get(r.reservation_id) ?? [];
    arr.push(r);
    roomsByRes.set(r.reservation_id, arr);
  });

  // Index reservas por (provider_id + categoría) -> fechas, para detectar duplicados huérfanos
  const reservationsByProviderCat = new Map<string, string[]>();
  (reservations ?? []).forEach((r: any) => {
    const cat = TYPE_TO_CATEGORY[r.type];
    if (!cat || !r.provider_id || !r.check_in) return;
    const key = `${r.provider_id}|${cat}`;
    const arr = reservationsByProviderCat.get(key) ?? [];
    arr.push(r.check_in);
    reservationsByProviderCat.set(key, arr);
  });

  function dayDiff(a: string, b: string): number {
    return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
  }

  // 1. Reservas marcadas como críticas manualmente
  (reservations ?? []).forEach((r: any) => {
    if (r.is_critical) {
      alerts.push({
        kind: "critical",
        title: `${r.providers?.name ?? "Reserva"}${r.location ? ` (${r.location})` : ""} marcada como crítica`,
        detail: [r.check_in ? formatDate(r.check_in) : null, r.notes].filter(Boolean).join(" — ") || undefined,
        sortDate: r.check_in,
      });
    }
  });

  // 2. Capacidad insuficiente (plazas < inscritos)
  (reservations ?? []).forEach((r: any) => {
    if (r.type === "alojamiento" && r.beds_count != null && inscritos > 0 && r.beds_count < inscritos) {
      alerts.push({
        kind: "capacity_low",
        title: `Faltan camas: ${r.providers?.name} día ${r.day_number ?? "?"} (${formatDate(r.check_in)})`,
        detail: `Solo ${r.beds_count} plazas para ${inscritos} inscritos. Falta${inscritos - r.beds_count > 1 ? "n" : ""} ${inscritos - r.beds_count}.`,
        sortDate: r.check_in,
      });
    }
  });

  // 2b. Exceso de camas — hay que cancelar 1 mes antes
  (reservations ?? []).forEach((r: any) => {
    if (r.type === "alojamiento" && r.beds_count != null && inscritos > 0 && r.beds_count > inscritos) {
      alerts.push({
        kind: "capacity_high",
        title: `Sobran camas: ${r.providers?.name} día ${r.day_number ?? "?"} (${formatDate(r.check_in)})`,
        detail: `${r.beds_count} reservadas para ${inscritos} inscritos. Sobran ${r.beds_count - inscritos} — cancelá 1 mes antes para no pagarlas.`,
        sortDate: r.check_in,
      });
    }
  });

  // 3. Pareja impar con habitaciones dobles
  if (inscritos > 0 && inscritos % 2 !== 0) {
    (reservations ?? []).forEach((r: any) => {
      if (r.type !== "alojamiento") return;
      const rs = roomsByRes.get(r.id) ?? [];
      const hasDoubles = rs.some((x) => x.room_type === "doble" && Number(x.rooms_count) > 0);
      if (hasDoubles) {
        alerts.push({
          kind: "odd_double",
          title: `Pareja impar (${inscritos} personas) con habitaciones dobles en ${r.providers?.name}`,
          detail: `Día ${r.day_number ?? "?"} (${formatDate(r.check_in)}). Considerá convertir 1 doble en triple o agregar una individual.`,
          sortDate: r.check_in,
        });
      }
    });
  }

  // 4. Cobertura de comidas
  if (mealCoverage) {
    for (const m of mealCoverage as any[]) {
      if (m.needs_breakfast && !m.has_breakfast) {
        alerts.push({ kind: "missing_breakfast", title: `Falta desayuno`, detail: formatDate(m.day_date), sortDate: m.day_date });
      }
      if (m.needs_dinner && !m.has_dinner) {
        alerts.push({ kind: "missing_dinner", title: `Falta cena`, detail: formatDate(m.day_date), sortDate: m.day_date });
      }
    }
  }

  // 5. Items presupuestados pendientes de reservar
  // Universal: no alerta si ya existe una reserva del mismo proveedor + categoría en fecha cercana (±2 días).
  // Esto cubre el caso de items huérfanos que el trigger todavía no linkeó.
  const expectsReservation = (b: any) =>
    ["Alojamiento", "Cenas", "Transporte"].includes(b.category) &&
    !b.reservation_id &&
    b.scaling !== "viatico_team" &&
    b.scaling !== "por_pagante";
  (budgetItems ?? []).forEach((b: any) => {
    if (!expectsReservation(b) || b.status !== "presupuestado") return;
    if (b.provider_id && b.item_date) {
      const dates = reservationsByProviderCat.get(`${b.provider_id}|${b.category}`) ?? [];
      const hasNearby = dates.some((d) => dayDiff(d, b.item_date) <= 2);
      if (hasNearby) return;
    }
    alerts.push({
      kind: "needs_reservation",
      title: `Sin reservar: ${b.description}`,
      detail: b.item_date ? `Día ${formatDate(b.item_date)}` : undefined,
      sortDate: b.item_date,
    });
  });

  // 5b. Cuotas del plan de pagos vencidas o próximas
  (scheduleRows ?? []).forEach((s: any) => {
    if (!s.due_date) return;
    const days = Number(s.days_until_due);
    const providerName = s.providers?.name ?? "Proveedor";
    const detail = `${formatDate(s.due_date)} · ${s.label ? s.label + " · " : ""}${new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(Number(s.amount_eur))}`;
    if (days < 0) {
      alerts.push({
        kind: "payment_overdue",
        title: `Pago VENCIDO: ${providerName}${s.location ? ` (${s.location})` : ""}`,
        detail: `${detail} — venció hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}`,
        sortDate: s.due_date,
      });
    } else if (days <= 14) {
      alerts.push({
        kind: "payment_due_soon",
        title: `Pagar ${providerName}${s.location ? ` (${s.location})` : ""}`,
        detail: `${detail} — ${days === 0 ? "vence hoy" : `en ${days} día${days === 1 ? "" : "s"}`}`,
        sortDate: s.due_date,
      });
    }
  });

  // 6. Reservas creadas pero aún en presupuestado / enviado
  (reservations ?? []).forEach((r: any) => {
    if (r.status === "presupuestado") {
      alerts.push({
        kind: "needs_send",
        title: `Sin enviar: ${r.providers?.name ?? "Reserva"}${r.location ? ` (${r.location})` : ""}`,
        detail: `Día ${formatDate(r.check_in)} — todavía no se envió la solicitud al proveedor`,
        sortDate: r.check_in,
      });
    } else if (r.status === "enviado") {
      alerts.push({
        kind: "needs_confirm",
        title: `Esperando respuesta: ${r.providers?.name ?? "Reserva"}${r.location ? ` (${r.location})` : ""}`,
        detail: `Día ${formatDate(r.check_in)} — enviado, falta confirmación del proveedor`,
        sortDate: r.check_in,
      });
    }
  });

  if (alerts.length === 0) return null;

  // Agrupar por kind, ordenar items por fecha ASC dentro de cada grupo
  const grouped = new Map<string, Alert[]>();
  alerts.forEach((a) => {
    const arr = grouped.get(a.kind) ?? [];
    arr.push(a);
    grouped.set(a.kind, arr);
  });
  grouped.forEach((arr) => {
    arr.sort((a, b) => {
      if (!a.sortDate && !b.sortDate) return 0;
      if (!a.sortDate) return 1;
      if (!b.sortDate) return -1;
      return a.sortDate.localeCompare(b.sortDate);
    });
  });

  const orderedKinds = KIND_ORDER.filter((k) => grouped.has(k))
    .concat(Array.from(grouped.keys()).filter((k) => !KIND_ORDER.includes(k)));

  const KIND_LABEL: Record<string, string> = {
    payment_overdue: "Pagos VENCIDOS al proveedor",
    payment_due_soon: "Pagos próximos al proveedor (próx. 14 días)",
    critical: "Marcadas críticas",
    capacity_low: "Faltan camas reservadas",
    capacity_high: "Sobran camas (cancelar 1 mes antes)",
    odd_double: "Habitaciones dobles con grupo impar",
    missing_breakfast: "Desayunos faltantes",
    missing_dinner: "Cenas faltantes",
    needs_reservation: "Pendientes de crear reserva",
    needs_send: "Pendientes de enviar al proveedor",
    needs_confirm: "Esperando confirmación del proveedor",
  };

  return (
    <Card className="border-aviso-300 border-2 bg-aviso-50">
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-aviso-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-aviso-900 mb-2">
              {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"} — revisá antes de avanzar
            </div>
            <div className="space-y-2">
              {orderedKinds.map((kind) => {
                const items = grouped.get(kind)!;
                return (
                  <div key={kind}>
                    <div className="text-xs font-semibold text-aviso-900 uppercase tracking-wider">{KIND_LABEL[kind] ?? kind} ({items.length})</div>
                    <ul className="text-sm text-aviso-900 space-y-0.5 mt-0.5">
                      {items.map((a, i) => (
                        <li key={i}>
                          ⚠ {a.title}
                          {a.detail && <span className="text-aviso-800 text-xs ml-1">— {a.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
