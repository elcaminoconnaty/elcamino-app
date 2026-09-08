import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEUR, formatCOP } from "@/lib/utils";

export function PaymentSummary({
  payments,
  totalEur,
  penaltyEur = 0,
}: {
  payments: any[];
  /** Total acordado, con la penalidad ya incluida. */
  totalEur: number;
  /** Penalidades cobradas (ej. cambio de camino); solo para mostrarlas aparte. */
  penaltyEur?: number;
}) {
  let copPaid = 0;
  let copEurEquivalent = 0;
  let eurPaid = 0;
  let usdPaid = 0;
  let totalEurEquivalent = 0;
  const byAccount = new Map<string, number>();

  for (const p of payments) {
    const eurEq = Number(p.amount_eur || 0);
    totalEurEquivalent += eurEq;
    if (p.currency === "COP") {
      copPaid += Number(p.amount);
      copEurEquivalent += eurEq;
    } else if (p.currency === "EUR") {
      eurPaid += Number(p.amount);
    } else if (p.currency === "USD") {
      usdPaid += Number(p.amount);
    }
    const acc = p.account || p.method || "Sin asignar";
    byAccount.set(acc, (byAccount.get(acc) ?? 0) + eurEq);
  }

  const pct = totalEur > 0 ? Math.round((totalEurEquivalent / totalEur) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resumen de pagos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-end justify-between mb-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Avance</span>
            <span className="text-sm font-medium">{pct}%</span>
          </div>
          <div className="h-2.5 bg-piedra-suave rounded-full overflow-hidden">
            <div className="h-full bg-ocre" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{formatEUR(totalEurEquivalent)}</span>
            <span>de {formatEUR(totalEur)}</span>
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          {penaltyEur > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Precio del viaje</span>
                <span>{formatEUR(totalEur - penaltyEur)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Penalidad</span>
                <span className="text-aviso-800">+ {formatEUR(penaltyEur)}</span>
              </div>
              <div className="flex justify-between font-medium pb-1.5 border-b mb-1.5">
                <span>Total acordado</span>
                <span>{formatEUR(totalEur)}</span>
              </div>
            </>
          )}
          {copPaid > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pagado en COP</span>
              <span>{formatCOP(copPaid)} <span className="text-xs text-muted-foreground">≈ {formatEUR(copEurEquivalent)}</span></span>
            </div>
          )}
          {eurPaid > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pagado en EUR</span>
              <span>{formatEUR(eurPaid)}</span>
            </div>
          )}
          {usdPaid > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pagado en USD</span>
              <span>{usdPaid.toLocaleString("es-CO")} USD</span>
            </div>
          )}
          <div className="flex justify-between font-medium pt-1.5 border-t mt-1.5">
            <span>Pendiente EUR</span>
            <span className={totalEur - totalEurEquivalent > 0 ? "text-aviso-700" : "text-ok-700"}>
              {formatEUR(totalEur - totalEurEquivalent)}
            </span>
          </div>
        </div>

        {byAccount.size > 0 && (
          <div className="pt-3 border-t">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Por cuenta destino</div>
            <div className="space-y-1 text-sm">
              {Array.from(byAccount.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([acc, eur]) => (
                  <div key={acc} className="flex justify-between">
                    <span>{acc}</span>
                    <span>{formatEUR(eur)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
