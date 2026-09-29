import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EurCop } from "@/components/ui/eur-cop";
import { formatEUR } from "@/lib/utils";
import { computeBreakEven, tablaPorCupo, type DepartureFinance } from "@/lib/finance";

/**
 * Cuánto gana el camino según cuántos paguen: desde hoy hasta llenar el cupo, con lo que suma
 * cada peregrino nuevo. Nico ajusta las camas a los inscritos (para eso están las alertas de
 * "sobran camas"), así que el costo de cada fila es el de esa cantidad de gente.
 */
export function UtilidadPorCupoCard({ finance, precioLista }: { finance: DepartureFinance; precioLista: number | null }) {
  const filas = tablaPorCupo(finance, precioLista);
  const equilibrio = computeBreakEven(finance).n;
  const precio = Number(precioLista ?? 0) > 0 ? Number(precioLista) : Number(finance.precio_promedio_pagante_eur ?? 0);
  const suma = filas.find((f) => f.suma_eur != null)?.suma_eur ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Utilidad según cuántos paguen</CardTitle>
        <CardDescription>
          Cada peregrino nuevo entra a {formatEUR(precio)}
          {suma != null ? <> y suma <strong className="text-ok-700">{formatEUR(suma)}</strong> a la utilidad</> : null}
          {equilibrio ? ` · punto de equilibrio: ${equilibrio} pagantes` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 px-4 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground sm:px-0">
          <span>Pagan</span>
          <span className="text-right">Utilidad</span>
          <span className="text-right w-20">Por pagante</span>
        </div>
        <ul className="divide-y">
          {filas.map((f) => (
            <li
              key={f.pagantes}
              className={`grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 px-4 py-2 sm:px-2 ${f.hoy ? "bg-ocre/15" : ""}`}
            >
              <span className="text-sm tabular-nums">
                <span className={f.hoy ? "font-semibold" : ""}>{f.pagantes}</span>
                {f.hoy && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-ocre-profundo">hoy</span>}
                {finance.capacity === f.pagantes && !f.hoy && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">lleno</span>}
              </span>
              <span className={`text-right text-sm font-medium tabular-nums ${f.utilidad_eur >= 0 ? "text-ok-700" : "text-error-700"}`}>
                <EurCop value={f.utilidad_eur} />
              </span>
              <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                {f.utilidad_por_pagante_eur != null ? formatEUR(f.utilidad_por_pagante_eur) : "—"}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
