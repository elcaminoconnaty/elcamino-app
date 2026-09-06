import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEUR, formatCOP, formatDate } from "@/lib/utils";
import { ESTADO_LIQUIDACION, type PilgrimSettlement } from "@/lib/settlement";
import { ClosingPaymentDialog } from "@/components/pilgrims/closing-payment-dialog";
import { SettlementTrmDialog } from "@/components/pilgrims/settlement-trm-dialog";
import { FileText, Scale } from "lucide-react";

/**
 * Liquidación final de una inscripción: cómo quedan los abonos al re-valorarlos a
 * la tasa de cierre, y qué falta cobrar o devolver.
 */
export function SettlementCard({ settlement: s }: { settlement: PilgrimSettlement }) {
  const estado = ESTADO_LIQUIDACION[s.estado_liquidacion];
  const trm = Number(s.settlement_trm ?? 0);
  const sinTasa = s.estado_liquidacion === "sin_tasa";
  const conRecalculo = s.settlement_mode === "recalculo";
  const dif = Number(s.fx_difference_eur ?? 0);
  // Una inscripción cancelada no se liquida: sus abonos se retienen o se
  // reembolsan por el flujo de eliminación, no por la tasa de cierre.
  const cancelada = s.status === "cancelado";

  if (cancelada) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-muted-foreground" /> Liquidación final
            </CardTitle>
            <Badge variant="muted">inscripción cancelada</Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta inscripción está cancelada, así que no entra en la liquidación de la salida. Tiene{" "}
          {formatEUR(s.paid_eur_historico)} en abonos registrados.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={sinTasa ? "" : "border-ocre border-2"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-ocre-profundo" /> Liquidación final
            </CardTitle>
            <CardDescription className="mt-0.5">
              {!conRecalculo ? (
                "Este camino liquida sin recálculo de tasa."
              ) : sinTasa ? (
                "Falta fijar la tasa de cierre de la salida."
              ) : (
                <>
                  Tasa de cierre <strong>{trm.toLocaleString("es-CO")} COP/EUR</strong>
                  {s.settlement_date ? ` · ${formatDate(s.settlement_date)}` : ""}
                  {s.settlement_source === "inscripcion" && " · pactada aparte"}
                </>
              )}
            </CardDescription>
          </div>
          <Badge variant={estado.badge}>{estado.label}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {sinTasa ? (
          <>
            <p className="text-sm text-muted-foreground">
              Un mes antes del viaje se fija la tasa de cierre y todos los abonos en pesos se re-valoran con ella.
              Hasta entonces el saldo que se muestra es el histórico: {formatEUR(s.pending_eur_historico)} pendientes.
            </p>
            <SettlementTrmDialog
              registrationId={s.registration_id}
              pilgrimName={s.pilgrim_name}
              currentTrm={s.settlement_trm}
              esExcepcion={s.settlement_source === "inscripcion"}
            />
          </>
        ) : (
          <>
            {/* El recálculo, paso por paso */}
            <div className="space-y-1.5 text-sm">
              <Row label="Total del viaje" value={formatEUR(s.net_total_eur)} cop={s.total_cop_cierre} />
              {conRecalculo && s.cop_revalorado > 0 && (
                <Row
                  label="Abonos en pesos, re-valorados"
                  sub={`${formatCOP(s.cop_revalorado)} ÷ ${trm.toLocaleString("es-CO")}`}
                  value={formatEUR(s.cop_revalorado / trm)}
                />
              )}
              {conRecalculo && s.eur_fijo !== 0 && (
                <Row label="Abonos ya en euros" sub="No se re-valoran" value={formatEUR(s.eur_fijo)} />
              )}
              <div className="flex justify-between pt-1.5 border-t">
                <span className="text-muted-foreground">{conRecalculo ? "Total acreditado" : "Total abonado"}</span>
                <span className="font-medium">{formatEUR(conRecalculo ? s.paid_eur_cierre : s.paid_eur_historico)}</span>
              </div>

              <div className="flex justify-between pt-1.5 border-t font-medium text-base">
                <span>{s.saldo_final_eur >= 0 ? "Falta por pagar" : "A favor del peregrino"}</span>
                <span className={s.saldo_final_eur > 0.5 ? "text-aviso-800" : s.saldo_final_eur < -0.5 ? "text-info-800" : "text-ok-700"}>
                  {formatEUR(Math.abs(s.saldo_final_eur))}
                  {s.saldo_final_cop != null && (
                    <span className="text-xs text-muted-foreground ml-1.5 font-normal">
                      · {formatCOP(Math.abs(s.saldo_final_cop))}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Lo que hay que hacer */}
            {s.estado_liquidacion === "por_cobrar" && (
              <div className="rounded-md bg-aviso-50 p-3 space-y-2">
                <p className="text-sm text-aviso-900">
                  Último pago del viaje:{" "}
                  <strong>{s.por_cobrar_cop != null ? formatCOP(s.por_cobrar_cop) : formatEUR(s.por_cobrar_eur)}</strong>
                  {s.por_cobrar_cop != null && ` (${formatEUR(s.por_cobrar_eur)})`}.
                </p>
                <ClosingPaymentDialog settlement={s} modo="cierre" />
              </div>
            )}
            {s.estado_liquidacion === "por_devolver" && (
              <div className="rounded-md bg-info-50 p-3 space-y-2">
                <p className="text-sm text-info-900">
                  Pagó de más: hay que girarle{" "}
                  <strong>{s.por_devolver_cop != null ? formatCOP(s.por_devolver_cop) : formatEUR(s.por_devolver_eur)}</strong>
                  {s.por_devolver_cop != null && ` (${formatEUR(s.por_devolver_eur)})`}.
                  {conRecalculo && dif > 0.5 && " Sus abonos valen más euros a la tasa de cierre que cuando los hizo."}
                </p>
                <ClosingPaymentDialog settlement={s} modo="devolucion" />
              </div>
            )}
            {(s.estado_liquidacion === "liquidado" || s.estado_liquidacion === "devuelto") && (
              <div className="rounded-md bg-ok-50 p-3 text-sm text-ok-900">
                {s.estado_liquidacion === "devuelto"
                  ? `Se le devolvieron ${s.devuelto_cop > 0 ? formatCOP(s.devuelto_cop) : formatEUR(s.devuelto_eur)} y el saldo quedó en cero.`
                  : conRecalculo
                    ? "El viaje quedó pagado completo a la tasa de cierre."
                    : "El viaje quedó pagado completo."}
              </div>
            )}

            {/* La diferencia en cambio: por qué la caja no coincide con el precio */}
            {conRecalculo && Math.abs(dif) > 0.5 && (
              <div className="text-xs text-muted-foreground border-t pt-3 space-y-0.5">
                <div className="flex justify-between">
                  <span>Euros que realmente entraron</span>
                  <span>{formatEUR(s.paid_eur_historico)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Diferencia en cambio {dif > 0 ? "(la absorbe el negocio)" : "(a favor del negocio)"}</span>
                  <span className={dif > 0 ? "text-error-700" : "text-ok-700"}>
                    {dif > 0 ? "−" : "+"}{formatEUR(Math.abs(dif))}
                  </span>
                </div>
                <p className="pt-1 leading-snug">
                  Los abonos conservan la tasa del día en que se hicieron; esta diferencia es lo que se movió la
                  tasa entre esos días y el cierre.
                </p>
              </div>
            )}

            {conRecalculo && (
              <div className="flex gap-2 flex-wrap pt-1">
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/pdf/liquidacion/${s.registration_id}`} target="_blank">
                    <FileText className="h-4 w-4" /> Recibo final
                  </a>
                </Button>
                <SettlementTrmDialog
                  registrationId={s.registration_id}
                  pilgrimName={s.pilgrim_name}
                  currentTrm={s.settlement_trm}
                  esExcepcion={s.settlement_source === "inscripcion"}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, sub, value, cop }: { label: string; sub?: string; value: string; cop?: number | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground min-w-0">
        {label}
        {sub && <span className="block text-[11px] leading-tight">{sub}</span>}
      </span>
      <span className="shrink-0 text-right">
        {value}
        {cop != null && <span className="block text-[11px] text-muted-foreground">{formatCOP(cop)}</span>}
      </span>
    </div>
  );
}
