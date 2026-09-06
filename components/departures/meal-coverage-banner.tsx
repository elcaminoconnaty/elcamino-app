import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Coffee, UtensilsCrossed } from "lucide-react";
import { formatDate } from "@/lib/utils";

export async function MealCoverageBanner({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const { data: rows } = await supabase
    .from("v_meal_coverage")
    .select("*")
    .eq("departure_id", departureId)
    .order("day_date");

  if (!rows || rows.length === 0) {
    return (
      <Card className="bg-alba border">
        <CardContent className="py-2.5 px-4 text-sm text-muted-foreground flex items-center gap-2">
          <Coffee className="h-4 w-4" />
          <UtensilsCrossed className="h-4 w-4" />
          <span>Cargá los alojamientos del grupo para ver qué comidas hay que reservar.</span>
        </CardContent>
      </Card>
    );
  }

  const missing: { day: string; what: "desayuno" | "cena" }[] = [];
  for (const r of rows as any[]) {
    if (r.needs_breakfast && !r.has_breakfast) missing.push({ day: r.day_date, what: "desayuno" });
    if (r.needs_dinner && !r.has_dinner) missing.push({ day: r.day_date, what: "cena" });
  }

  if (missing.length === 0) {
    return (
      <Card className="border-ok-200 bg-ok-50">
        <CardContent className="py-2.5 px-4 text-sm text-ok-900 flex items-center gap-2">
          <Coffee className="h-4 w-4" />
          <UtensilsCrossed className="h-4 w-4" />
          <span>Todas las comidas del grupo están cubiertas (incluidas en hoteles o reservadas aparte).</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-aviso-300 border-2 bg-aviso-50">
      <CardContent className="py-3 px-4 text-sm">
        <div className="flex items-start gap-3">
          <div className="flex gap-1 text-aviso-700 shrink-0 mt-0.5">
            <Coffee className="h-4 w-4" />
            <UtensilsCrossed className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-aviso-900 mb-1">Faltan comidas del grupo por reservar</div>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((m, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-aviso-100 text-aviso-900 rounded-full px-2.5 py-1 text-xs">
                  {m.what === "desayuno" ? <Coffee className="h-3 w-3" /> : <UtensilsCrossed className="h-3 w-3" />}
                  {m.what} · {formatDate(m.day)}
                </span>
              ))}
            </div>
            <div className="text-xs text-aviso-800 mt-1.5">
              Marcá ✓ desayuno / ✓ cena en las habitaciones del alojamiento, o creá una reserva tipo "Cenas" para esa fecha.
              Solo aparecen días donde el grupo está alojado con la agencia.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
