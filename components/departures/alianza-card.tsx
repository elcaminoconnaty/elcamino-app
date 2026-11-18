import { Card, CardContent } from "@/components/ui/card";
import { EurCop } from "@/components/ui/eur-cop";
import { Handshake } from "lucide-react";
import { repartoAlianza, tablaPorCupo, type ConfigAlianza, type DepartureFinance, type RepartoAlianza } from "@/lib/finance";

/**
 * El reparto de un camino en alianza: agenciamiento de ECN sobre el costo y la utilidad que queda
 * repartida entre ECN y el aliado. Se ve con los inscritos de hoy y con el cupo lleno, y cuenta de
 * parte de quién llegó cada peregrino.
 */
export function AlianzaCard({
  finance: f,
  config,
  precioLista,
  origen,
}: {
  finance: DepartureFinance;
  config: ConfigAlianza;
  precioLista: number | null;
  origen: { ecn: number; aliado: number; sinDefinir: number };
}) {
  const hoy = repartoAlianza(Number(f.expected_revenue_eur ?? 0), Number(f.costo_total_eur ?? 0), config);
  const filas = tablaPorCupo(f, precioLista);
  const ultima = filas[filas.length - 1];
  const lleno = ultima && !ultima.hoy ? repartoAlianza(ultima.ingreso_eur, ultima.costo_eur, config) : null;
  const ecnPct = 100 - config.socioPct;

  return (
    <Card className="border-ocre border-2">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-noche">
            <Handshake className="h-4 w-4" /> Alianza con {config.socio}
          </div>
          <div className="text-xs text-muted-foreground">
            Agenciamiento ECN {config.agenciamientoPct}% sobre el costo · utilidad ECN {ecnPct}% / {config.socio} {config.socioPct}%
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-piedra-suave px-2.5 py-1">De ECN: <strong>{origen.ecn}</strong></span>
          <span className="rounded-full bg-piedra-suave px-2.5 py-1">De {config.socio}: <strong>{origen.aliado}</strong></span>
          {origen.sinDefinir > 0 && (
            <span className="rounded-full bg-aviso-100 text-aviso-900 px-2.5 py-1">Sin definir: <strong>{origen.sinDefinir}</strong></span>
          )}
        </div>

        <div className={`grid gap-3 grid-cols-1 ${lleno ? "lg:grid-cols-2" : ""}`}>
          <Reparto titulo={`Con los inscritos de hoy (${f.pagantes_count})`} r={hoy} config={config} />
          {lleno && <Reparto titulo={`Con el cupo lleno (${ultima.pagantes})`} r={lleno} config={config} />}
        </div>
        {hoy.a_repartir_eur < 0 && (
          <p className="text-[11px] text-error-700">
            Con los inscritos de hoy no alcanza para el agenciamiento: lo que se reparte sale negativo.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Reparto({ titulo, r, config }: { titulo: string; r: RepartoAlianza; config: ConfigAlianza }) {
  const neg = (n: number) => (n < 0 ? "text-error-700" : "");
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{titulo}</div>
      <dl className="space-y-1 text-sm">
        <Fila label="Ingresos" value={<EurCop value={r.ingreso_eur} />} />
        <Fila label="− Costo del camino" value={<EurCop value={r.costo_eur} />} />
        <Fila label={`− Agenciamiento ECN (${config.agenciamientoPct}%)`} value={<EurCop value={r.agenciamiento_eur} />} />
        <Fila label="= Utilidad a repartir" value={<EurCop value={r.a_repartir_eur} />} strong cls={neg(r.a_repartir_eur)} />
        <Fila label={`ECN ${100 - config.socioPct}%`} value={<EurCop value={r.ecn_parte_eur} />} cls={neg(r.ecn_parte_eur)} />
        <Fila label={`${config.socio} ${config.socioPct}%`} value={<EurCop value={r.socio_eur} />} cls={neg(r.socio_eur)} />
      </dl>
      <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total ECN</div>
          <div className={`font-display text-lg font-semibold ${r.ecn_total_eur >= 0 ? "text-ok-700" : "text-error-700"}`}>
            <EurCop value={r.ecn_total_eur} />
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total {config.socio}</div>
          <div className={`font-display text-lg font-semibold ${r.socio_eur >= 0 ? "text-ok-700" : "text-error-700"}`}>
            <EurCop value={r.socio_eur} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Fila({ label, value, strong, cls }: { label: string; value: React.ReactNode; strong?: boolean; cls?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "font-medium border-t pt-1" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums text-right ${cls ?? ""}`}>{value}</dd>
    </div>
  );
}
