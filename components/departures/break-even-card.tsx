import { Card, CardContent } from "@/components/ui/card";
import { computeBreakEven, type DepartureFinance } from "@/lib/finance";

export function BreakEvenCard({ finance }: { finance: DepartureFinance }) {
  const be = computeBreakEven(finance);
  const reached = be.n != null && finance.pagantes_count >= be.n;
  const missing = be.n != null ? Math.max(0, be.n - finance.pagantes_count) : null;

  return (
    <Card className={reached ? "border-ok-300 border-2" : be.reachable ? "border-ocre border-2" : "border-error-200 border-2"}>
      <CardContent className="p-4 space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Punto de equilibrio</div>
        {!be.reachable ? (
          <>
            <div className="text-lg font-display font-semibold text-error-700">No alcanza</div>
            <div className="text-xs text-muted-foreground">
              Aunque se llene la capacidad, los costos fijos no se cubren. Revisá el precio o los viáticos.
            </div>
          </>
        ) : reached ? (
          <>
            <div className="text-lg font-display font-semibold text-ok-700">✓ Alcanzado con {be.n} pagantes</div>
            <div className="text-xs text-muted-foreground">Cada peregrino adicional suma a la utilidad.</div>
          </>
        ) : (
          <>
            <div className="text-lg font-display font-semibold">Faltan {missing} pagantes</div>
            <div className="text-xs text-muted-foreground">
              Necesitás <strong>{be.n}</strong> en total{finance.capacity ? ` (de ${finance.capacity})` : ""} para no perder plata.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
