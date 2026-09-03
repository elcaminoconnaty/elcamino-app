import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEUR, formatCOP, formatDate } from "@/lib/utils";
import { ESTADO_LIQUIDACION, SETTLEMENT_MODE, type PilgrimSettlement, type SettlementMode } from "@/lib/settlement";
import { ClosingPaymentDialog } from "@/components/pilgrims/closing-payment-dialog";
import { FreezeTrmBanner, SettlementRateDialog } from "@/components/departures/freeze-trm-banner";
import { SettlementModeDialog } from "@/components/departures/settlement-mode-dialog";
import { GLOBAL66 } from "@/lib/constants";
import type { Departure } from "@/types/db";
import { FileText, Scale } from "lucide-react";

/**
 * Liquidación de toda la salida. En modo recálculo se fija la tasa de cierre y
 * se ve, peregrino por peregrino, cuánto falta cobrar y a quién hay que
 * devolverle. En modo sin recálculo el saldo es simplemente lo acordado menos lo
 * abonado, y desde acá se registra igual el último pago.
 */
export async function LiquidacionTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: departure }, { data: rows }] = await Promise.all([
    supabase.from("departures").select("*").eq("id", departureId).maybeSingle(),
    supabase
      .from("v_pilgrim_settlement")
      .select("*")
      .eq("departure_id", departureId)
      .neq("status", "cancelado")
      .order("pilgrim_name"),
  ]);

  const d = departure as Departure | null;
  // El equipo no paga viaje, así que no entra a la liquidación.
  const todos = ((rows as PilgrimSettlement[]) ?? []).filter((r) => !r.is_team && Number(r.net_total_eur) > 0);
  const modo: SettlementMode = (d?.settlement_mode as SettlementMode) ?? "recalculo";
  const conRecalculo = modo === "recalculo";
  const trm = Number(d?.trm_frozen_value ?? 0);
  const hayTasa = conRecalculo && trm > 0;
  const faltaTasa = conRecalculo && trm <= 0;

  const porCobrar = todos.reduce((s, r) => s + Number(r.por_cobrar_eur ?? 0), 0);
  const porDevolver = todos.reduce((s, r) => s + Number(r.por_devolver_eur ?? 0), 0);
  const difCambio = todos.reduce((s, r) => s + Number(r.fx_difference_eur ?? 0), 0);
  const acreditado = todos.reduce((s, r) => s + Number(r.paid_eur_cierre ?? 0), 0);
  const cajaReal = todos.reduce((s, r) => s + Number(r.paid_eur_historico ?? 0), 0);
  const listos = todos.filter((r) => r.estado_liquidacion === "liquidado" || r.estado_liquidacion === "devuelto").length;
  const hayGlobal66 = todos.some((r) => Number(r.eur_fijo ?? 0) !== 0);

  return (
    <div className="space-y-4">
      {/* Modo del camino, siempre visible y siempre cambiable */}
      <Card>
        <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Modo de liquidación</div>
            <div className="text-sm font-medium">{SETTLEMENT_MODE[modo].label}</div>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">{SETTLEMENT_MODE[modo].description}</p>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            <SettlementModeDialog departureId={departureId} currentMode={modo} />
            {conRecalculo && (
              <SettlementRateDialog
                departureId={departureId}
                currentTrm={d?.trm_frozen_value ?? null}
                currentDate={d?.trm_frozen_at_date ?? null}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {faltaTasa && d?.start_date && (
        <FreezeTrmBanner departureId={departureId} startDate={formatDate(d.start_date)} urgente={todos.length > 0} />
      )}

      {hayTasa && (
        <Card className="border-camino-yellow border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-camino-deepYellow" /> Tasa de cierre {trm.toLocaleString("es-CO")} COP/EUR
            </CardTitle>
            <CardDescription>
              Fijada el {formatDate(d!.trm_frozen_at_date)}. Todos los abonos que se quedaron en pesos se re-valoran con
              ella; los abonos conservan la tasa del día en que se hicieron. {listos} de {todos.length} peregrinos cerrados.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Cifra label="Falta por cobrar" value={formatEUR(porCobrar)} sub={formatCOP(porCobrar * trm)} tone="amber" />
            <Cifra label="Por devolver" value={formatEUR(porDevolver)} sub={formatCOP(porDevolver * trm)} tone="blue" />
            <Cifra label="Euros que entraron" value={formatEUR(cajaReal)} sub={`acreditado: ${formatEUR(acreditado)}`} />
            <Cifra
              label="Diferencia en cambio"
              value={`${difCambio > 0 ? "−" : "+"}${formatEUR(Math.abs(difCambio))}`}
              sub={difCambio > 0 ? "la absorbe el negocio" : "a favor del negocio"}
              tone={difCambio > 0 ? "red" : "green"}
            />
          </CardContent>
        </Card>
      )}

      {!conRecalculo && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-muted-foreground" /> Sin recálculo de tasa
            </CardTitle>
            <CardDescription>
              El saldo de cada peregrino es el total acordado menos lo que abonó, con la tasa del día de cada abono.
              No hay tasa de cierre ni diferencia en cambio. {listos} de {todos.length} peregrinos al día.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            <Cifra label="Falta por cobrar" value={formatEUR(porCobrar)} tone="amber" />
            <Cifra label="Por devolver" value={formatEUR(porDevolver)} sub="pagaron más de lo acordado" tone="blue" />
            <Cifra label="Euros que entraron" value={formatEUR(cajaReal)} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {todos.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Aún no hay peregrinos pagantes en este camino.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Peregrino</TableHead>
                  <TableHead className="text-right">Total viaje</TableHead>
                  <TableHead className="text-right">Pagó en pesos</TableHead>
                  <TableHead className="text-right">{conRecalculo ? "Acreditado" : "Abonado"}</TableHead>
                  {conRecalculo && <TableHead className="text-right">Dif. cambio</TableHead>}
                  <TableHead className="text-right">Saldo final</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Cerrar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todos.map((r) => {
                  const estado = ESTADO_LIQUIDACION[r.estado_liquidacion];
                  const dif = Number(r.fx_difference_eur ?? 0);
                  const saldo = Number(r.saldo_final_eur ?? 0);
                  return (
                    <TableRow key={r.registration_id}>
                      <TableCell>
                        <Link href={`/peregrinos/${r.pilgrim_id}`} className="hover:underline font-medium">
                          {r.pilgrim_name}
                        </Link>
                        {r.settlement_source === "inscripcion" && (
                          <span className="block text-[10px] text-muted-foreground">
                            tasa propia {Number(r.settlement_trm).toLocaleString("es-CO")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatEUR(r.net_total_eur)}
                        {r.total_cop_cierre != null && (
                          <span className="block text-[10px] text-muted-foreground">{formatCOP(r.total_cop_cierre)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {r.cop_revalorado > 0 ? formatCOP(r.cop_revalorado) : "—"}
                        {r.eur_fijo !== 0 && (
                          <span className="block text-[10px] text-muted-foreground">+ {formatEUR(r.eur_fijo)} en EUR</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-green-700 whitespace-nowrap">
                        {formatEUR(conRecalculo ? r.paid_eur_cierre : r.paid_eur_historico)}
                        {conRecalculo && Math.abs(dif) > 0.005 && (
                          <span className="block text-[10px] text-muted-foreground">entraron {formatEUR(r.paid_eur_historico)}</span>
                        )}
                      </TableCell>
                      {conRecalculo && (
                        <TableCell className={`text-right text-xs ${dif > 0.005 ? "text-red-700" : dif < -0.005 ? "text-green-700" : "text-muted-foreground"}`}>
                          {Math.abs(dif) <= 0.005 ? "—" : `${dif > 0 ? "−" : "+"}${formatEUR(Math.abs(dif))}`}
                        </TableCell>
                      )}
                      <TableCell className="text-right whitespace-nowrap font-medium">
                        {Math.abs(saldo) <= 0.5 ? (
                          <span className="text-green-700">{formatEUR(0)}</span>
                        ) : (
                          <span className={saldo > 0 ? "text-amber-800" : "text-blue-800"}>
                            {saldo < 0 && "−"}{formatEUR(Math.abs(saldo))}
                            {r.saldo_final_cop != null && (
                              <span className="block text-[10px] text-muted-foreground font-normal">
                                {formatCOP(Math.abs(r.saldo_final_cop))}
                              </span>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell><Badge variant={estado.badge}>{estado.label}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.estado_liquidacion === "por_cobrar" && <ClosingPaymentDialog settlement={r} modo="cierre" />}
                          {r.estado_liquidacion === "por_devolver" && <ClosingPaymentDialog settlement={r} modo="devolucion" />}
                          {conRecalculo && r.settlement_trm != null && (
                            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                              <a href={`/api/pdf/liquidacion/${r.registration_id}`} target="_blank" title="Recibo final">
                                <FileText className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {hayTasa && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>Cómo se lee.</strong> «Acreditado» son los euros que valen los abonos del peregrino a la tasa de
          cierre — eso es lo que se le abona al viaje. «Entraron» son los euros reales que llegaron a las cuentas
          cuando hizo cada abono. La «diferencia en cambio» es el hueco entre los dos: lo que se movió la tasa entre
          el día de cada abono y el cierre.
          {hayGlobal66 && (
            <> Los pagos por <span className="whitespace-nowrap">{GLOBAL66}</span> y los que ya venían en euros no se
            re-valoran, porque ahí el euro quedó fijado el mismo día.</>
          )}
        </p>
      )}
    </div>
  );
}

function Cifra({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "amber" | "blue" | "red" | "green";
}) {
  const txt =
    tone === "amber" ? "text-amber-800"
    : tone === "blue" ? "text-blue-800"
    : tone === "red" ? "text-red-700"
    : tone === "green" ? "text-green-700"
    : "";
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</div>
      <div className={`text-base sm:text-lg font-display font-semibold mt-0.5 truncate ${txt}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}
