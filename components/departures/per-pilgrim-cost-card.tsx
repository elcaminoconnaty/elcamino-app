import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EurCop } from "@/components/ui/eur-cop";
import { formatEUR } from "@/lib/utils";
import { PerPilgrimCostBreakdown, type NetoCategory, type NetoLineItem } from "@/components/departures/per-pilgrim-cost-breakdown";

export async function PerPilgrimCostCard({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: items }, { data: reservations }, { data: providers }, { data: finance }] = await Promise.all([
    supabase
      .from("budget_items")
      .select("id, category, scaling, estimated_unit_cost_eur, confirmed_unit_cost_eur, quantity, reservation_id, description")
      .eq("departure_id", departureId)
      .neq("status", "cancelado"),
    supabase
      .from("reservations")
      .select("id, type, location, check_in, beds_count, estimated_cost_eur, confirmed_cost_eur, pricing_mode, provider_id")
      .eq("departure_id", departureId),
    supabase.from("providers").select("id, name"),
    supabase.from("v_departure_finance").select("pagantes_count, team_count").eq("departure_id", departureId).maybeSingle(),
  ]);

  const pagantes = Number((finance as any)?.pagantes_count ?? 0);
  const team = Number((finance as any)?.team_count ?? 0);

  const reservationById = new Map<string, any>();
  (reservations ?? []).forEach((r: any) => reservationById.set(r.id, r));
  const providerNameById = new Map<string, string>();
  (providers ?? []).forEach((p: any) => providerNameById.set(p.id, p.name));

  // 1) COSTO NETO por peregrino — lo que UN peregrino consume directamente.
  //    Para reservas: precio por persona = costo_total / beds_count (cada reserva cuenta UNA vez,
  //    aunque tenga varios budget_items apuntando a ella).
  //    Para por_pagante: unit_cost
  const catMap = new Map<string, { total: number; items: NetoLineItem[]; dups: number }>();
  const seenReservations = new Map<string, string>(); // reservation_id -> category where counted
  let netoTotal = 0;

  function ensureCat(category: string) {
    let c = catMap.get(category);
    if (!c) { c = { total: 0, items: [], dups: 0 }; catMap.set(category, c); }
    return c;
  }

  (items ?? []).forEach((b: any) => {
    if (b.scaling === "por_pagante") {
      const unit = Number(b.confirmed_unit_cost_eur ?? b.estimated_unit_cost_eur ?? 0);
      if (unit <= 0) return;
      const c = ensureCat(b.category);
      c.items.push({
        source: "por_pagante",
        label: b.description || "(sin descripción)",
        perPerson: unit,
        detail: "por pagante",
      });
      c.total += unit;
      netoTotal += unit;
      return;
    }
    if (b.reservation_id) {
      const r = reservationById.get(b.reservation_id);
      if (!r) return;
      if (r.type === "transporte" && r.pricing_mode === "total") return;
      const total = Number(r.confirmed_cost_eur ?? r.estimated_cost_eur ?? 0);
      const persons = Number(r.beds_count ?? 0);
      if (persons <= 0 || total <= 0) return;
      const perPerson = total / persons;
      const c = ensureCat(b.category);
      const alreadyCountedCat = seenReservations.get(b.reservation_id);

      const providerName = r.provider_id ? providerNameById.get(r.provider_id) : null;
      const labelBase = [providerName, r.location].filter(Boolean).join(" — ") || b.description || "(reserva)";
      const detailParts: string[] = [];
      if (r.check_in) detailParts.push(String(r.check_in));
      detailParts.push(b.description || "");

      if (alreadyCountedCat) {
        // Duplicate budget_item pointing to a reservation already counted → mark, don't double-count
        c.items.push({
          source: "reservation",
          label: labelBase,
          perPerson,
          totalCost: total,
          beds: persons,
          reservationId: b.reservation_id,
          duplicate: true,
          detail: `duplicado de "${b.description || ""}" (ya contado en ${alreadyCountedCat})`,
        });
        c.dups += 1;
        return;
      }

      seenReservations.set(b.reservation_id, b.category);
      c.items.push({
        source: "reservation",
        label: labelBase,
        perPerson,
        totalCost: total,
        beds: persons,
        reservationId: b.reservation_id,
        detail: detailParts.filter(Boolean).join(" · "),
      });
      c.total += perPerson;
      netoTotal += perPerson;
    }
  });

  const categoriasOrdenadas: NetoCategory[] = Array.from(catMap.entries())
    .map(([category, v]) => ({ category, total: v.total, items: v.items, duplicatesIgnored: v.dups }))
    .sort((a, b) => b.total - a.total);

  // 2) COSTO TOTAL DEL CAMINO (fijo) — lo que la agencia paga, comprometido.
  let totalFijoCamino = 0;
  let totalViaticoTeam = 0;

  (items ?? []).forEach((b: any) => {
    const total = Number(b.confirmed_unit_cost_eur ?? b.estimated_unit_cost_eur ?? 0) * Number(b.quantity);
    if (b.scaling === "fijo_grupo") {
      totalFijoCamino += total;
    } else if (b.scaling === "viatico_team") {
      totalViaticoTeam += total;
    }
  });

  // Items por_pagante × pagantes (lo que la agencia paga en items individuales)
  const totalPorPagantes = (items ?? [])
    .filter((b: any) => b.scaling === "por_pagante")
    .reduce((s: number, b: any) => s + Number(b.confirmed_unit_cost_eur ?? b.estimated_unit_cost_eur ?? 0), 0) * pagantes;

  const costoTotalCamino = totalFijoCamino + totalViaticoTeam + totalPorPagantes;
  const costoPorPaganteProrrateado = pagantes > 0 ? costoTotalCamino / pagantes : 0;

  // Desperdicio: diferencia entre lo que paga la agencia (total fijo) y lo que realmente consumen los inscritos
  // Aproximación: por cada reserva, desperdicio = (beds_count - inscritos) × precio_por_cama (si beds > inscritos)
  // Solo aplica a alojamientos y cenas (no transporte ni viatico)
  let totalDesperdicio = 0;
  (reservations ?? []).forEach((r: any) => {
    if (!["alojamiento", "cenas"].includes(r.type)) return;
    const beds = Number(r.beds_count ?? 0);
    const total = Number(r.confirmed_cost_eur ?? r.estimated_cost_eur ?? 0);
    if (beds <= 0 || total <= 0) return;
    const perPerson = total / beds;
    const inscritos = pagantes + team;
    if (beds > inscritos) {
      totalDesperdicio += (beds - inscritos) * perPerson;
    }
  });

  // Proyección con +5 pagantes
  const proyectadoPlus5 = pagantes + 5 > 0
    ? (totalFijoCamino + totalViaticoTeam + ((items ?? []).filter((b: any) => b.scaling === "por_pagante").reduce((s: number, b: any) => s + Number(b.confirmed_unit_cost_eur ?? b.estimated_unit_cost_eur ?? 0), 0) * (pagantes + 5))) / (pagantes + 5)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Costo NETO por peregrino</CardTitle>
            <CardDescription>
              Lo que cuesta UN peregrino directamente (su cama, su cena, sus servicios).
              <strong> No depende del número total de inscritos.</strong> Tocá cada categoría para ver el desglose.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PerPilgrimCostBreakdown categories={categoriasOrdenadas} total={netoTotal} />
          </CardContent>
        </Card>

        <Card className="border-camino-yellow border-2">
          <CardHeader>
            <CardTitle className="text-base">Costo TOTAL prorrateado por peregrino</CardTitle>
            <CardDescription>
              Todo lo que paga la agencia ÷ N° de pagantes (incluye desperdicio si reservás más camas que inscritos).
              <strong> Baja cuando suben inscritos.</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Costo total del camino (todo)</span>
              <span><EurCop value={costoTotalCamino} /></span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pl-3">
              <span>Alojamientos / cenas / transportes (fijo)</span>
              <span><EurCop value={totalFijoCamino} /></span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pl-3">
              <span>Viáticos equipo</span>
              <span><EurCop value={totalViaticoTeam} /></span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pl-3">
              <span>Items por peregrino × {pagantes}</span>
              <span><EurCop value={totalPorPagantes} /></span>
            </div>
            {totalDesperdicio > 0 && (
              <div className="flex justify-between text-xs text-red-700 pl-3 mt-1">
                <span>⚠ De ese total, desperdicio en camas vacías</span>
                <span><EurCop value={totalDesperdicio} /></span>
              </div>
            )}
            <div className="border-t pt-2 mt-2 flex justify-between font-semibold text-base">
              <span>÷ {pagantes || "?"} pagantes =</span>
              <span className="text-camino-deepYellow"><EurCop value={costoPorPaganteProrrateado} /></span>
            </div>
            {pagantes > 0 && (
              <div className="text-xs text-muted-foreground pt-1">
                Con +5 pagantes ({pagantes + 5}): <strong><EurCop value={proyectadoPlus5} /></strong> por peregrino.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {totalDesperdicio > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 px-4 text-sm text-amber-900">
            <strong>⚠ Desperdicio en alojamientos / cenas:</strong> {formatEUR(totalDesperdicio)} —
            tenés más plazas reservadas que inscritos ({pagantes + team}). Si no liberás esas plazas, la agencia las paga igual.
            Editá las reservas y bajá el número de habitaciones, o agregá más peregrinos.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
