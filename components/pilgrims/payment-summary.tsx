import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEUR, formatCOP } from "@/lib/utils";

/**
 * El resumen de pagos de la ficha del peregrino.
 *
 * El avance y el pendiente salen de `v_pilgrim_settlement` (una fila por inscripción no
 * cancelada): `paid_eur_cierre` es lo acreditado (a la tasa de cierre cuando la hay, y ya sin
 * devoluciones) y `saldo_final_eur` el saldo. Antes se restaba precio − Σ amount_eur a la tasa
 * de cada abono, y a quien ya había liquidado o recibido su devolución le salía un pendiente
 * falso (a Santiago, 283 € que en realidad se le habían devuelto). Los cortes por divisa y por
 * cuenta sí salen de los movimientos: son la plata que efectivamente se movió.
 */
export type LiquidacionResumen = {
  net_total_eur: number | string;
  paid_eur_cierre: number | string;
  saldo_final_eur: number | string;
  penalidad_eur?: number | string | null;
  settlement_trm?: number | string | null;
};

export function PaymentSummary({
  payments,
  liquidacion,
}: {
  payments: any[];
  /** Filas de v_pilgrim_settlement de las inscripciones NO canceladas. */
  liquidacion: LiquidacionResumen[];
}) {
  const totalEur = liquidacion.reduce((s, r) => s + Number(r.net_total_eur || 0), 0);
  const acreditado = liquidacion.reduce((s, r) => s + Number(r.paid_eur_cierre || 0), 0);
  const saldo = liquidacion.reduce((s, r) => s + Number(r.saldo_final_eur || 0), 0);
  const penaltyEur = liquidacion.reduce((s, r) => s + Number(r.penalidad_eur || 0), 0);
  const conCierre = liquidacion.some((r) => r.settlement_trm != null);
  let copPaid = 0;
  let copEurEquivalent = 0;
  let eurPaid = 0;
  let usdPaid = 0;
  const byAccount = new Map<string, number>();

  for (const p of payments) {
    const eurEq = Number(p.amount_eur || 0);
    // La penalidad no es plata que se movió: no va en los cortes por divisa ni por cuenta.
    if (p.kind === "penalidad") continue;
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

  const pct = totalEur > 0 ? Math.round((acreditado / totalEur) * 100) : 0;

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
            <span>{formatEUR(acreditado)}{conCierre ? " acreditado" : ""}</span>
            <span>de {formatEUR(totalEur)}</span>
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio del viaje</span>
            <span>{formatEUR(totalEur)}</span>
          </div>
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
          {penaltyEur > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Penalidad</span>
              <span className="text-aviso-800">− {formatEUR(penaltyEur)}</span>
            </div>
          )}
          <div className="flex justify-between font-medium pt-1.5 border-t mt-1.5">
            <span>{saldo < -0.5 ? "A favor del peregrino" : "Pendiente EUR"}</span>
            <span className={saldo > 0.5 ? "text-aviso-700" : "text-ok-700"}>
              {formatEUR(Math.abs(saldo) < 0.005 ? 0 : Math.abs(saldo))}
            </span>
          </div>
          {conCierre && (
            <p className="text-[11px] text-muted-foreground">Liquidado a la tasa de cierre: los abonos en pesos se revaloraron.</p>
          )}
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
