import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { simulateScenario, type DepartureFinance } from "@/lib/finance";
import { formatEUR } from "@/lib/utils";

export function ScenariosCard({ finance, scenarios = [6, 10, 15, 20] }: { finance: DepartureFinance; scenarios?: number[] }) {
  // Asegurar que el escenario actual esté incluido
  const set = new Set([...scenarios, finance.pagantes_count]);
  const points = Array.from(set).filter((n) => n > 0).sort((a, b) => a - b);
  const sims = points.map((n) => simulateScenario(finance, n));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Escenarios de utilidad</CardTitle>
        <div className="text-xs text-muted-foreground">Asumiendo precio promedio actual de {formatEUR(finance.precio_promedio_pagante_eur)} por peregrino</div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {sims.map((s) => {
          const isCurrent = s.pagantes === finance.pagantes_count;
          const positive = s.utilidad_total_eur >= 0;
          return (
            <div key={s.pagantes} className={`flex items-center justify-between rounded-md px-3 py-2 ${isCurrent ? "bg-ocre/15 border border-ocre" : "bg-alba"}`}>
              <div className="text-sm">
                <span className={isCurrent ? "font-semibold" : ""}>{s.pagantes} pagantes</span>
                {isCurrent && <span className="text-[10px] uppercase tracking-wider text-ocre-profundo ml-2">hoy</span>}
              </div>
              <div className={`text-sm font-medium ${positive ? "text-ok-700" : "text-error-700"}`}>
                {positive ? "+" : ""}{formatEUR(s.utilidad_total_eur)}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
