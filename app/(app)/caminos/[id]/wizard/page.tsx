import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrmProvider, TrmSelector } from "@/components/ui/eur-cop";
import { WizardProgress, WizardNav } from "@/components/wizard/wizard-progress";
import { StepBasicos } from "@/components/wizard/step-basicos";
import { StepAlojamientos } from "@/components/wizard/step-alojamientos";
import { StepCenas } from "@/components/wizard/step-cenas";
import { StepTransportes } from "@/components/wizard/step-transportes";
import { StepViaticos } from "@/components/wizard/step-viaticos";
import { StepPorPeregrino } from "@/components/wizard/step-por-peregrino";
import { getDeparturesDays } from "@/lib/actions/route-template";

export const dynamic = "force-dynamic";

export default async function WizardPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { step?: string };
}) {
  const supabase = createClient();
  const { data: departure } = await supabase
    .from("departures")
    .select("*, routes(*)")
    .eq("id", params.id)
    .maybeSingle();
  if (!departure) notFound();

  const step = searchParams.step ?? "basicos";

  const [{ data: latestTrm }, { count: budgetCount }, { count: reservasCount }, { data: allRoutes }] = await Promise.all([
    supabase.from("trm_rates").select("eur_cop").order("date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("budget_items").select("*", { count: "exact", head: true }).eq("departure_id", params.id),
    supabase.from("reservations").select("*", { count: "exact", head: true }).eq("departure_id", params.id),
    supabase.from("routes").select("id, name, slug").eq("active", true).order("name"),
  ]);

  const defaultTrm = Number(departure.trm_frozen_value ?? latestTrm?.eur_cop ?? 0);
  const hasItems = (budgetCount ?? 0) > 0;

  // Cálculo de completion por step
  const [
    { count: alojCount },
    { count: cenaCount },
    { count: transpCount },
    { count: preCount },
    { count: durCount },
    { count: postCount },
    { count: ppCount },
  ] = await Promise.all([
    supabase.from("reservations").select("*", { count: "exact", head: true }).eq("departure_id", params.id).eq("type", "alojamiento"),
    supabase.from("reservations").select("*", { count: "exact", head: true }).eq("departure_id", params.id).eq("type", "cenas"),
    supabase.from("reservations").select("*", { count: "exact", head: true }).eq("departure_id", params.id).eq("type", "transporte"),
    supabase.from("budget_items").select("*", { count: "exact", head: true }).eq("departure_id", params.id).eq("scaling", "viatico_team"),
    supabase.from("budget_items").select("*", { count: "exact", head: true }).eq("departure_id", params.id).eq("scaling", "viatico_team"),
    supabase.from("budget_items").select("*", { count: "exact", head: true }).eq("departure_id", params.id).eq("scaling", "viatico_team"),
    supabase.from("budget_items").select("*", { count: "exact", head: true }).eq("departure_id", params.id).eq("scaling", "por_pagante"),
  ]);

  const completion: Record<string, boolean> = {
    basicos: !!departure.start_date && !!departure.route_id,
    alojamientos: (alojCount ?? 0) > 0,
    cenas: (cenaCount ?? 0) > 0 || (alojCount ?? 0) > 0,
    transportes: (transpCount ?? 0) > 0,
    "viaticos-pre": (preCount ?? 0) > 0,
    "viaticos-durante": (durCount ?? 0) > 0,
    "viaticos-post": (postCount ?? 0) > 0,
    "por-peregrino": (ppCount ?? 0) > 0,
  };

  const days = await getDeparturesDays(params.id);

  return (
    <TrmProvider defaultTrm={defaultTrm}>
      <div className="space-y-5 max-w-5xl mx-auto">
        <div>
          <Link href={`/caminos/${departure.id}`} className="text-sm text-muted-foreground hover:underline">← Volver al camino</Link>
          <div className="flex items-start justify-between mt-2 flex-wrap gap-2">
            <div>
              <h1 className="font-display text-2xl md:text-3xl text-noche">Wizard · {departure.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">Armá todo el camino paso a paso</p>
              <div className="brand-yellow-bar mt-2" />
            </div>
            <TrmSelector />
          </div>
        </div>

        <WizardProgress departureId={departure.id} completion={completion} />

        <div>
          {step === "basicos" && (
            <StepBasicos departure={departure} route={(departure as any).routes} days={days} hasItems={hasItems} allRoutes={allRoutes ?? []} />
          )}
          {step === "alojamientos" && <StepAlojamientos departureId={departure.id} />}
          {step === "cenas" && <StepCenas departureId={departure.id} />}
          {step === "transportes" && <StepTransportes departureId={departure.id} />}
          {step === "viaticos-pre" && <StepViaticos departureId={departure.id} phase="pre" />}
          {step === "viaticos-durante" && <StepViaticos departureId={departure.id} phase="durante" />}
          {step === "viaticos-post" && <StepViaticos departureId={departure.id} phase="post" />}
          {step === "por-peregrino" && <StepPorPeregrino departureId={departure.id} />}
        </div>

        <WizardNav departureId={departure.id} currentKey={step} />
      </div>
    </TrmProvider>
  );
}
