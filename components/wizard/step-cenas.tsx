import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { EurCop } from "@/components/ui/eur-cop";
import { AddReservation } from "@/components/departures/add-reservation";
import { EditReservationDialog } from "@/components/departures/edit-reservation-dialog";
import { MealCoverageBanner } from "@/components/departures/meal-coverage-banner";
import { UtensilsCrossed, Coffee } from "lucide-react";

export async function StepCenas({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: reservations }, { data: providers }] = await Promise.all([
    supabase
      .from("reservations")
      .select("*, providers(name, type)")
      .eq("departure_id", departureId)
      .eq("type", "cenas")
      .order("check_in", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
  ]);

  return (
    <div className="space-y-4">
      <MealCoverageBanner departureId={departureId} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UtensilsCrossed className="h-5 w-5" /> Cenas / restaurantes aparte</CardTitle>
          <CardDescription>
            Si alguna noche el alojamiento NO incluye la cena, o querés agregar una cena de gala separada, creala acá.
            Las cenas que ya están incluidas en un hotel se gestionan desde Alojamientos marcando ✓ Cena en la habitación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-3">
            <AddReservation departureId={departureId} providers={providers ?? []} defaultType="cenas" />
          </div>

          {(!reservations || reservations.length === 0) ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              Sin reservas de comida extra. Si el banner de arriba dice que falta cena algún día, agregala con &quot;+ Nueva reserva&quot; tipo &quot;Cenas&quot;.
            </div>
          ) : (
            <div className="space-y-2">
              {reservations.map((r: any) => {
                const isCena = r.meal_kind === "cena";
                const isDes = r.meal_kind === "desayuno";
                return (
                  <div key={r.id} className="rounded-md border bg-cream-50/50 p-3 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      {isCena && <UtensilsCrossed className="h-4 w-4 text-amber-700" />}
                      {isDes && <Coffee className="h-4 w-4 text-amber-700" />}
                      <span className="text-xs text-muted-foreground">{formatDate(r.check_in)}</span>
                      <span className="font-medium truncate">{r.providers?.name ?? "Restaurante"}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.meal_kind ? `${r.meal_kind} · ${r.meal_persons ?? "?"}p × ${r.meal_price_per_person_eur ?? 0}€` : r.location}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <EurCop value={r.confirmed_cost_eur ?? r.estimated_cost_eur} />
                      <Badge variant={r.status === "reservado" ? "accent" : "muted"} className="text-[10px]">{r.status}</Badge>
                      <EditReservationDialog reservation={r} providers={providers ?? []} departureId={departureId} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
