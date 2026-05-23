import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatEUR, daysUntil, cn } from "@/lib/utils";
import { FreezeTrmBanner } from "@/components/departures/freeze-trm-banner";
import { CriticalAlertsBanner } from "@/components/departures/critical-alerts-banner";
import { MealCoverageBanner } from "@/components/departures/meal-coverage-banner";
import { DeletePassportsButton } from "@/components/departures/delete-passports-button";
import { ResumenTab } from "@/components/departures/tabs/resumen-tab";
import { PeregrinosTab } from "@/components/departures/tabs/peregrinos-tab";
import { PresupuestoTab } from "@/components/departures/tabs/presupuesto-tab";
import { ViaticosTab } from "@/components/departures/tabs/viaticos-tab";
import { ReservasTab } from "@/components/departures/tabs/reservas-tab";
import { GastosTab } from "@/components/departures/tabs/gastos-tab";
import { computeBreakEven, type DepartureFinance } from "@/lib/finance";
import { TrmProvider, TrmSelector, EurCop } from "@/components/ui/eur-cop";
import type { Departure } from "@/types/db";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "resumen", label: "Resumen" },
  { value: "peregrinos", label: "Peregrinos" },
  { value: "presupuesto", label: "Presupuesto" },
  { value: "viaticos", label: "Viáticos equipo" },
  { value: "reservas", label: "Reservas" },
  { value: "gastos", label: "Gastos" },
];

export default async function DepartureDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const supabase = createClient();
  const { data: departure } = await supabase
    .from("departures")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!departure) notFound();
  const d = departure as Departure;

  const [{ data: finance }, { data: latestTrm }] = await Promise.all([
    supabase.from("v_departure_finance").select("*").eq("departure_id", params.id).maybeSingle(),
    supabase.from("trm_rates").select("eur_cop").order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const f = (finance as DepartureFinance) ?? null;
  const defaultTrm = Number(d.trm_frozen_value ?? latestTrm?.eur_cop ?? 0);
  const days = d.start_date ? daysUntil(d.start_date) : null;
  const needsFreeze = days !== null && days <= 30 && days >= -7 && !d.trm_frozen_at_date;
  const activeTab = searchParams.tab ?? "resumen";

  const be = f ? computeBreakEven(f) : null;
  const utilPositive = f && Number(f.utilidad_total_eur) >= 0;
  const capacityProgress = f && d.capacity && d.capacity > 0
    ? Math.min(100, Math.round((f.pagantes_count / d.capacity) * 100))
    : 0;

  return (
    <TrmProvider defaultTrm={defaultTrm}>
    <div className="space-y-6">
      <div>
        <Link href="/caminos" className="text-sm text-muted-foreground hover:underline">← Caminos</Link>
        <div className="flex items-start justify-between mt-2 gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl text-camino-ink break-words">{d.name}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {formatDate(d.start_date)} – {formatDate(d.end_date)}
              {days !== null && days >= 0 && ` · faltan ${days} días`}
            </p>
            <div className="brand-yellow-bar mt-2" />
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <TrmSelector />
            <Link href={`/caminos/${d.id}/wizard`} className="inline-flex items-center gap-1 bg-camino-yellow text-camino-ink rounded-md px-3 py-1.5 text-sm font-medium hover:bg-camino-deepYellow">
              ✨ Wizard
            </Link>
            <Badge variant="muted">{d.status}</Badge>
            {d.status === "finished" && <DeletePassportsButton departureId={d.id} />}
          </div>
        </div>
      </div>

      {f && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <Card className="border-camino-yellow border-2">
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Peregrinos inscritos</div>
              <div className="text-xl sm:text-2xl font-display font-semibold mt-1">
                {f.pagantes_count}{d.capacity ? <span className="text-muted-foreground text-base"> / {d.capacity}</span> : null}
              </div>
              <div className="text-xs text-muted-foreground">+ {f.team_count} equipo</div>
              {d.capacity ? (
                <div className="mt-2 h-1.5 bg-cream-100 rounded-full overflow-hidden">
                  <div className="h-full bg-camino-yellow" style={{ width: `${capacityProgress}%` }} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Viáticos equipo</div>
              <div className="text-xl sm:text-2xl font-display font-semibold mt-1">
                <EurCop value={f.viatico_team_eur} />
              </div>
              <div className="text-xs text-muted-foreground">
                ÷ {f.pagantes_count || "?"} = <EurCop value={f.pagantes_count > 0 ? Number(f.viatico_team_eur) / f.pagantes_count : 0} /> /peregrino
              </div>
            </CardContent>
          </Card>

          <Card className={utilPositive ? "border-green-200 border-2" : "border-red-200 border-2"}>
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Utilidad proyectada</div>
              <div className={`text-xl sm:text-2xl font-display font-semibold mt-1 ${utilPositive ? "text-green-700" : "text-red-700"}`}>
                <EurCop value={f.utilidad_total_eur} />
              </div>
              <div className="text-xs text-muted-foreground">
                <EurCop value={f.utilidad_por_pagante_eur} /> por peregrino
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Costo por pagante</div>
              <div className="text-xl sm:text-2xl font-display font-semibold mt-1">
                <EurCop value={f.costo_por_pagante_unitario_eur} />
              </div>
              <div className="text-xs text-muted-foreground">vs <EurCop value={f.precio_promedio_pagante_eur} /> promedio</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Punto de equilibrio</div>
              {be && be.reachable && be.n != null ? (
                <>
                  <div className="text-xl sm:text-2xl font-display font-semibold mt-1">{be.n} <span className="text-base text-muted-foreground">pagantes</span></div>
                  <div className="text-xs text-muted-foreground">
                    {f.pagantes_count >= be.n ? "✓ Alcanzado" : `Faltan ${be.n - f.pagantes_count}`}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xl sm:text-2xl font-display font-semibold mt-1 text-red-700">No alcanza</div>
                  <div className="text-xs text-muted-foreground">Revisá precio o viáticos</div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <CriticalAlertsBanner departureId={d.id} inscritosTotal={f?.inscritos_total ?? 0} />
      <MealCoverageBanner departureId={d.id} />
      {needsFreeze && <FreezeTrmBanner departureId={d.id} startDate={d.start_date!} />}
      {d.trm_frozen_at_date && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-3 text-sm text-green-900">
            ✓ TRM congelada en <strong>{Number(d.trm_frozen_value).toLocaleString("es-CO")} COP/EUR</strong> el {formatDate(d.trm_frozen_at_date)}
          </CardContent>
        </Card>
      )}

      <div className="border-b -mx-4 sm:mx-0 px-4 sm:px-0">
        <nav className="flex gap-0.5 sm:gap-1 overflow-x-auto -mb-px">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/caminos/${d.id}?tab=${t.value}`}
              className={cn(
                "px-3 sm:px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap shrink-0",
                activeTab === t.value
                  ? "border-camino-yellow text-camino-ink font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <div>
        {activeTab === "resumen" && <ResumenTab departureId={d.id} />}
        {activeTab === "peregrinos" && <PeregrinosTab departureId={d.id} />}
        {activeTab === "presupuesto" && <PresupuestoTab departureId={d.id} />}
        {activeTab === "viaticos" && <ViaticosTab departureId={d.id} />}
        {activeTab === "reservas" && <ReservasTab departureId={d.id} />}
        {activeTab === "gastos" && <GastosTab departureId={d.id} />}
      </div>
    </div>
    </TrmProvider>
  );
}
