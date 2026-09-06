import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatEUR } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { DepartureSummary } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function CaminosListPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("v_departure_summary")
    .select("*")
    .order("start_date", { ascending: true });
  const departures = (data as DepartureSummary[]) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-noche">Caminos</h1>
          <p className="text-sm text-muted-foreground">Salidas grupales con fecha</p>
          <div className="brand-yellow-bar mt-2" />
        </div>
        <Button asChild variant="accent">
          <Link href="/caminos/nuevo"><Plus className="h-4 w-4" /> Nuevo camino</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {departures.length === 0 && (
          <Card className="sm:col-span-2 xl:col-span-3">
            <CardContent className="py-12 text-center text-muted-foreground">
              Aún no hay caminos creados.
            </CardContent>
          </Card>
        )}
        {departures.map((d) => (
          <Link key={d.departure_id} href={`/caminos/${d.departure_id}`}>
            <Card className="hover:border-ocre transition-colors h-full">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{d.name}</CardTitle>
                    <CardDescription>{formatDate(d.start_date)} – {formatDate(d.end_date)}</CardDescription>
                  </div>
                  <Badge variant="muted">{d.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Peregrinos</span>
                  <span>{d.pilgrims_count}{d.capacity ? ` / ${d.capacity}` : ""}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ingresos esperados</span>
                  <span>{formatEUR(d.expected_revenue_eur)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cobrado</span>
                  <span>{formatEUR(d.collected_revenue_eur)}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
