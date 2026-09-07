import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatEUR, daysUntil, cn } from "@/lib/utils";
import { CriticalAlertsBanner } from "@/components/departures/critical-alerts-banner";
import { MealCoverageBanner } from "@/components/departures/meal-coverage-banner";
import { DeletePassportsButton } from "@/components/departures/delete-passports-button";
import { ResumenTab } from "@/components/departures/tabs/resumen-tab";
import { PeregrinosTab } from "@/components/departures/tabs/peregrinos-tab";
import { PagosTab } from "@/components/departures/tabs/pagos-tab";
import { LiquidacionTab } from "@/components/departures/tabs/liquidacion-tab";
import { PresupuestoTab } from "@/components/departures/tabs/presupuesto-tab";
import { ViaticosTab } from "@/components/departures/tabs/viaticos-tab";
import { ReservasTab } from "@/components/departures/tabs/reservas-tab";
import { GastosTab } from "@/components/departures/tabs/gastos-tab";
import { DocumentoTab } from "@/components/departures/tabs/documento-tab";
import { ContratosTab } from "@/components/departures/tabs/contratos-tab";
import { MoneyPanorama } from "@/components/departures/money-panorama";
import { type DepartureFinance } from "@/lib/finance";
import { TrmProvider, TrmSelector } from "@/components/ui/eur-cop";
import type { Departure } from "@/types/db";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "resumen", label: "Resumen" },
  { value: "pagos", label: "Pagos" },
  { value: "liquidacion", label: "Liquidación" },
  { value: "peregrinos", label: "Peregrinos" },
  { value: "contratos", label: "Contratos" },
  { value: "presupuesto", label: "Presupuesto" },
  { value: "viaticos", label: "Viáticos equipo" },
  { value: "reservas", label: "Reservas" },
  { value: "gastos", label: "Otros gastos" },
  { value: "documento", label: "Documento de viaje" },
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

  const [{ data: finance }, { data: payable }, { data: latestTrm }] = await Promise.all([
    supabase.from("v_departure_finance").select("*").eq("departure_id", params.id).maybeSingle(),
    supabase.from("v_departure_payable").select("*").eq("departure_id", params.id).maybeSingle(),
    supabase.from("trm_rates").select("eur_cop").order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const f = (finance as DepartureFinance) ?? null;
  const defaultTrm = Number(d.trm_frozen_value ?? latestTrm?.eur_cop ?? 0);
  const days = d.start_date ? daysUntil(d.start_date) : null;
  // Solo tiene sentido recordar la tasa de cierre si el camino liquida con recálculo.
  const conRecalculo = (d.settlement_mode ?? "recalculo") === "recalculo";
  const needsFreeze = conRecalculo && days !== null && days <= 30 && days >= -7 && !d.trm_frozen_at_date;
  const activeTab = searchParams.tab ?? "resumen";

  return (
    <TrmProvider defaultTrm={defaultTrm}>
    <div className="space-y-6">
      <div>
        <Link href="/caminos" className="text-sm text-muted-foreground hover:underline">← Caminos</Link>
        <div className="flex items-start justify-between mt-2 gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl text-noche break-words">{d.name}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {formatDate(d.start_date)} – {formatDate(d.end_date)}
              {days !== null && days >= 0 && ` · faltan ${days} días`}
            </p>
            <div className="brand-yellow-bar mt-2" />
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <TrmSelector />
            <Link href={`/caminos/${d.id}/wizard`} className="inline-flex items-center gap-1 bg-ocre text-noche rounded-md px-3 py-1.5 text-sm font-medium hover:bg-ocre-profundo">
              ✨ Wizard
            </Link>
            <Badge variant="muted">{d.status}</Badge>
            {d.status === "finished" && <DeletePassportsButton departureId={d.id} />}
          </div>
        </div>
      </div>

      {f && (
        <MoneyPanorama finance={f} payable={payable as any} capacity={d.capacity ?? null} />
      )}

      <CriticalAlertsBanner departureId={d.id} inscritosTotal={f?.inscritos_total ?? 0} />
      <MealCoverageBanner departureId={d.id} />
      {needsFreeze && activeTab !== "liquidacion" && (
        <Card className="border-ocre border-2 bg-ocre/10">
          <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap text-sm">
            <span>
              La salida es en {days} días: es momento de fijar la <strong>tasa de cierre</strong> y recalcular los
              abonos en pesos.
            </span>
            <Link href={`/caminos/${d.id}?tab=liquidacion`} className="inline-flex items-center gap-1 bg-ocre text-noche rounded-md px-3 py-1.5 font-medium hover:bg-ocre-profundo whitespace-nowrap">
              Ir a la liquidación
            </Link>
          </CardContent>
        </Card>
      )}
      {conRecalculo && d.trm_frozen_at_date && activeTab !== "liquidacion" && (
        <Card className="border-ok-200 bg-ok-50">
          <CardContent className="py-3 text-sm text-ok-900 flex items-center justify-between gap-3 flex-wrap">
            <span>
              ✓ Tasa de cierre en <strong>{Number(d.trm_frozen_value).toLocaleString("es-CO")} COP/EUR</strong> desde el {formatDate(d.trm_frozen_at_date)}
            </span>
            <Link href={`/caminos/${d.id}?tab=liquidacion`} className="underline whitespace-nowrap">Ver liquidación</Link>
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
                  ? "border-ocre text-noche font-medium"
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
        {activeTab === "pagos" && <PagosTab departureId={d.id} />}
        {activeTab === "liquidacion" && <LiquidacionTab departureId={d.id} />}
        {activeTab === "peregrinos" && <PeregrinosTab departureId={d.id} />}
        {activeTab === "presupuesto" && <PresupuestoTab departureId={d.id} />}
        {activeTab === "viaticos" && <ViaticosTab departureId={d.id} />}
        {activeTab === "reservas" && <ReservasTab departureId={d.id} />}
        {activeTab === "gastos" && <GastosTab departureId={d.id} />}
        {activeTab === "contratos" && <ContratosTab departureId={d.id} />}
        {activeTab === "documento" && <DocumentoTab departureId={d.id} />}
      </div>
    </div>
    </TrmProvider>
  );
}
