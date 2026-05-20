import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatEUR, daysUntil, cn } from "@/lib/utils";
import { FreezeTrmBanner } from "@/components/departures/freeze-trm-banner";
import { ResumenTab } from "@/components/departures/tabs/resumen-tab";
import { PeregrinosTab } from "@/components/departures/tabs/peregrinos-tab";
import { PresupuestoTab } from "@/components/departures/tabs/presupuesto-tab";
import { ReservasTab } from "@/components/departures/tabs/reservas-tab";
import { GastosTab } from "@/components/departures/tabs/gastos-tab";
import type { DepartureSummary, Departure } from "@/types/db";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "resumen", label: "Resumen" },
  { value: "peregrinos", label: "Peregrinos" },
  { value: "presupuesto", label: "Presupuesto" },
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

  const { data: summary } = await supabase
    .from("v_departure_summary")
    .select("*")
    .eq("departure_id", params.id)
    .maybeSingle();

  const sum = (summary as DepartureSummary) ?? null;
  const days = d.start_date ? daysUntil(d.start_date) : null;
  const needsFreeze = days !== null && days <= 30 && days >= -7 && !d.trm_frozen_at_date;
  const activeTab = searchParams.tab ?? "resumen";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/caminos" className="text-sm text-muted-foreground hover:underline">← Caminos</Link>
        <div className="flex items-start justify-between mt-2 gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-3xl text-camino-ink">{d.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDate(d.start_date)} – {formatDate(d.end_date)}
              {days !== null && days >= 0 && ` · faltan ${days} días`}
            </p>
            <div className="brand-yellow-bar mt-2" />
          </div>
          <Badge variant="muted">{d.status}</Badge>
        </div>
      </div>

      {needsFreeze && <FreezeTrmBanner departureId={d.id} startDate={d.start_date!} />}
      {d.trm_frozen_at_date && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-3 text-sm text-green-900">
            ✓ TRM congelada en <strong>{Number(d.trm_frozen_value).toLocaleString("es-CO")} COP/EUR</strong> el {formatDate(d.trm_frozen_at_date)}
          </CardContent>
        </Card>
      )}

      <div className="border-b">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/caminos/${d.id}?tab=${t.value}`}
              className={cn(
                "px-4 py-2 text-sm border-b-2 transition-colors -mb-px whitespace-nowrap",
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
        {activeTab === "resumen" && <ResumenTab departureId={d.id} summary={sum} />}
        {activeTab === "peregrinos" && <PeregrinosTab departureId={d.id} />}
        {activeTab === "presupuesto" && <PresupuestoTab departureId={d.id} />}
        {activeTab === "reservas" && <ReservasTab departureId={d.id} />}
        {activeTab === "gastos" && <GastosTab departureId={d.id} />}
      </div>
    </div>
  );
}
