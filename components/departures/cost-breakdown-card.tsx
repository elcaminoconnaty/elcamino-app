import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatEUR } from "@/lib/utils";
import { EurCop } from "@/components/ui/eur-cop";
import type { DepartureFinance } from "@/lib/finance";

export function CostBreakdownCard({ finance }: { finance: DepartureFinance }) {
  const inscritos = finance.inscritos_total;
  const pagantes = finance.pagantes_count;
  const team = finance.team_count;

  // Componentes del costo por pagante
  // Cuando hay 0 pagantes, los costos fijos quedan sin alguien que los pague
  const camasYServiciosPersona = finance.por_inscrito_unit_eur; // cada cama/servicio que toca a UN inscrito
  const serviciosPagantePersona = finance.por_pagante_unit_eur;
  const camasYServiciosTeamPorPagante = pagantes > 0 ? (camasYServiciosPersona * team) / pagantes : 0; // las camas de Naty+Nico se reparten entre pagantes
  const fijoGrupoPorPagante = pagantes > 0 ? finance.fijo_grupo_eur / pagantes : 0;
  const viaticoTeamPorPagante = pagantes > 0 ? finance.viatico_team_eur / pagantes : 0;

  const totalPorPagante = camasYServiciosPersona + serviciosPagantePersona + camasYServiciosTeamPorPagante + fijoGrupoPorPagante + viaticoTeamPorPagante;
  const precioPagante = Number(finance.precio_promedio_pagante_eur ?? 0);
  const utilidadPagante = precioPagante - totalPorPagante;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Costo por peregrino pagante</CardTitle>
        <CardDescription>Cómo se compone con {pagantes} pagantes y {team} de equipo</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        <Row label={`Su cama + servicios (1 inscrito)`} value={<EurCop value={camasYServiciosPersona} />} />
        <Row label={`Sus servicios personales`} value={<EurCop value={serviciosPagantePersona} />} />
        {team > 0 && (
          <Row
            label={`Camas equipo (${team} × ${formatEUR(camasYServiciosPersona)}) ÷ ${pagantes}`}
            value={<EurCop value={camasYServiciosTeamPorPagante} />}
            hint
          />
        )}
        {finance.fijo_grupo_eur > 0 && (
          <Row
            label={`Costos fijos del grupo ÷ ${pagantes}`}
            value={<EurCop value={fijoGrupoPorPagante} />}
            hint
          />
        )}
        {finance.viatico_team_eur > 0 && (
          <Row
            label={`Viáticos equipo (${formatEUR(finance.viatico_team_eur)}) ÷ ${pagantes}`}
            value={<EurCop value={viaticoTeamPorPagante} />}
            hint
          />
        )}
        <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
          <span>Costo total por pagante</span>
          <span><EurCop value={totalPorPagante} /></span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Precio promedio</span>
          <span><EurCop value={precioPagante} /></span>
        </div>
        <div className={`flex justify-between font-semibold pt-1 border-t ${utilidadPagante >= 0 ? "text-green-700" : "text-red-700"}`}>
          <span>Utilidad por pagante</span>
          <span><EurCop value={utilidadPagante} /></span>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: boolean }) {
  return (
    <div className={`flex justify-between ${hint ? "text-xs text-muted-foreground pl-3" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
