import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatEUR, formatDate, daysUntil } from "@/lib/utils";
import type { FinancialGlobal, DepartureSummary, AccountBalance, AccountCurrencyBreakdown } from "@/types/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AccountBalancesCard } from "@/components/finance/account-balances-card";

export const dynamic = "force-dynamic";

export default async function NatyDashboard() {
  const supabase = createClient();
  const [
    { data: g },
    { data: dps },
    { data: upcoming },
    { data: fin },
    { data: payable },
    { data: accounts },
    { data: accountsByCurrency },
  ] = await Promise.all([
    supabase.from("v_financial_global").select("*").maybeSingle(),
    supabase.from("v_departure_summary").select("*").order("start_date", { ascending: true }),
    supabase.from("v_upcoming_installments").select("*").limit(15),
    supabase.from("v_departure_finance").select("departure_id, name, costo_peregrinos_eur, costo_equipo_eur, fijo_grupo_eur, costo_total_eur").order("start_date", { ascending: true }),
    supabase.from("v_departure_payable").select("*"),
    supabase.from("v_account_balances").select("*"),
    supabase.from("v_account_currency_breakdown").select("*"),
  ]);
  const global = (g as FinancialGlobal) ?? null;
  const departures = (dps as DepartureSummary[]) ?? [];
  const upcomingInstallments = upcoming ?? [];
  const totalUpcoming = upcomingInstallments.reduce((s: number, i: any) => s + Number(i.amount_eur || 0), 0);

  // Falta por pagar por ítem del presupuesto (incluye viáticos y tiquetes, descuenta
  // pagos hechos como provider_payment o como gasto vinculado). Fuente: v_budget_payable.
  const payableByDep = new Map<string, number>();
  (payable ?? []).forEach((p: any) => payableByDep.set(p.departure_id, Number(p.falta_por_pagar_eur || 0)));
  const faltaPorPagar = (payable ?? []).reduce((s: number, p: any) => s + Number(p.falta_por_pagar_eur || 0), 0);

  const finRows = (fin ?? []) as any[];
  const costoPeregrinosGlobal = finRows.reduce((s, r) => s + Number(r.costo_peregrinos_eur || 0), 0);
  const costoEquipoGlobal = finRows.reduce((s, r) => s + Number(r.costo_equipo_eur || 0), 0);
  const costoFijoGlobal = finRows.reduce((s, r) => s + Number(r.fijo_grupo_eur || 0), 0);
  const costoTotalGlobal = costoPeregrinosGlobal + costoEquipoGlobal + costoFijoGlobal;
  const caminosConCosto = finRows.filter((r) => Number(r.costo_total_eur || 0) > 0);

  // Con salidas ya liquidadas, el pendiente real es el saldo a la tasa de cierre:
  // los abonos en pesos re-valorados. La diferencia en cambio es plata que no va
  // a entrar (o que entró de más), así que va aparte y no como "pendiente".
  const hayLiquidacion = Number(global?.pending_settled_eur ?? 0) > 0 || Number(global?.por_devolver_eur ?? 0) > 0.5;
  const pendientePorEntrar = hayLiquidacion
    ? Number(global?.pending_settled_eur ?? 0)
    : Number(global?.pending_revenue_eur ?? 0);
  const porDevolver = Number(global?.por_devolver_eur ?? 0);
  const difCambio = Number(global?.fx_difference_eur ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wider text-ocre-profundo font-medium">Dashboard de Naty</p>
        <h1 className="font-display text-3xl text-noche">Cómo va el negocio</h1>
        <div className="brand-yellow-bar mt-2" />
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Plata disponible" value={formatEUR(global?.cash_available_eur)} hint="Cobrado − pagado prov. − operativo − personal" accent />
        <KPI label="Utilidad proyectada" value={formatEUR(global?.projected_profit_eur)} hint="Ingresos esperados − costo estimado" />
        <KPI
          label="Pendiente por entrar"
          value={formatEUR(pendientePorEntrar)}
          hint={hayLiquidacion ? "Liquidado a la tasa de cierre" : "De peregrinos inscritos"}
        />
        <KPI label="Falta por pagar" value={formatEUR(faltaPorPagar)} hint="Costo del presupuesto − ya pagado (incluye viáticos y tiquetes)" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Cobrado" value={formatEUR(global?.collected_eur)} small />
        {porDevolver > 0.5 && (
          <KPI label="Por devolver a peregrinos" value={formatEUR(porDevolver)} hint="Pagaron de más a la tasa de cierre" small />
        )}
        {Math.abs(difCambio) > 0.5 && (
          <KPI
            label="Diferencia en cambio"
            value={`${difCambio > 0 ? "−" : "+"}${formatEUR(Math.abs(difCambio))}`}
            hint="Movimiento de la tasa entre cada abono y el cierre"
            small
          />
        )}
        <KPI label="Pagado a proveedores" value={formatEUR(global?.paid_providers_eur)} small />
        <KPI label="Gastos operativos" value={formatEUR(global?.operational_expenses_eur)} small />
        <KPI label="Retiros personales" value={formatEUR(global?.personal_withdrawals_eur)} small />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="font-display text-xl text-noche">Dónde está la plata</h2>
          <p className="text-sm text-muted-foreground">
            Saldo de cada cuenta. En las que hubo cambio de divisa (Global 66, bancos en COP) se ve
            cuánto se pagó en pesos, cuánto quedó en euros y a qué tasa.
          </p>
        </div>
        <AccountBalancesCard
          accounts={(accounts as AccountBalance[]) ?? []}
          breakdown={(accountsByCurrency as AccountCurrencyBreakdown[]) ?? []}
          variant="compact"
          title="Cuentas"
        />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="font-display text-xl text-noche">Costo: equipo vs peregrinos</h2>
          <p className="text-sm text-muted-foreground">Lo que cuesta el equipo (Naty + Nico) discriminado del costo de los peregrinos</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 mb-4">
          <KPI label="Costo peregrinos" value={formatEUR(costoPeregrinosGlobal)} hint="Camas, cenas, materiales, seguros — solo pagantes" />
          <KPI label="Costo equipo (Naty + Nico)" value={formatEUR(costoEquipoGlobal)} hint="Viáticos + sus camas/cenas + sus materiales y seguros" accent />
          <KPI label="Fijo de grupo" value={formatEUR(costoFijoGlobal)} hint="Costos del grupo que no escalan por persona" />
        </div>
        <Card>
          <CardContent className="p-0">
            {caminosConCosto.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Aún no hay costos cargados en ningún camino.</div>
            ) : (
              <div className="divide-y">
                {caminosConCosto.map((r) => {
                  const total = Number(r.costo_total_eur || 0);
                  const eq = Number(r.costo_equipo_eur || 0);
                  const per = Number(r.costo_peregrinos_eur || 0);
                  const pctEquipo = total > 0 ? Math.round((eq / total) * 100) : 0;
                  return (
                    <Link key={r.departure_id} href={`/caminos/${r.departure_id}`} className="block px-4 py-3 hover:bg-alba">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground shrink-0">{pctEquipo}% equipo</div>
                      </div>
                      <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-piedra-suave">
                        <div className="h-full bg-ocre" style={{ width: `${total > 0 ? (per / total) * 100 : 0}%` }} title="Peregrinos" />
                        <div className="h-full bg-ocre-profundo" style={{ width: `${pctEquipo}%` }} title="Equipo" />
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span>Peregrinos {formatEUR(per)}</span>
                        <span>Equipo {formatEUR(eq)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="font-display text-xl text-noche">Próximos cobros</h2>
            <p className="text-sm text-muted-foreground">Cuotas pendientes de peregrinos — total {formatEUR(totalUpcoming)}</p>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            {upcomingInstallments.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No hay cuotas pendientes registradas. Definí planes de pago en cada inscripción.</div>
            ) : (
              <div className="divide-y">
                {upcomingInstallments.map((i: any) => {
                  const days = daysUntil(i.due_date);
                  const isOverdue = days < 0;
                  const isSoon = days >= 0 && days <= 7;
                  return (
                    <Link key={i.id} href={`/peregrinos/${i.pilgrim_id}`} className="flex items-center justify-between px-4 py-3 hover:bg-alba">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{i.pilgrim_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{i.departure_name} · {i.label ?? "Cuota"}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-medium">{formatEUR(i.amount_eur)}</div>
                          <div className={`text-xs ${isOverdue ? "text-error-700 font-medium" : isSoon ? "text-aviso-700" : "text-muted-foreground"}`}>
                            {formatDate(i.due_date)}{isOverdue ? ` · ${-days}d vencida` : days === 0 ? " · hoy" : ` · en ${days}d`}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="font-display text-xl text-noche">Por camino</h2>
            <p className="text-sm text-muted-foreground">Proyecciones y avance por salida</p>
          </div>
          <Link href="/caminos" className="text-sm text-ocre-profundo hover:underline">Ver todos →</Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {departures.length === 0 && (
            <Card className="md:col-span-2">
              <CardContent className="py-12 text-center text-muted-foreground">
                Aún no hay caminos creados. <Link href="/caminos/nuevo" className="underline text-ocre-profundo">Crear el primero</Link>.
              </CardContent>
            </Card>
          )}
          {departures.map((d) => {
            const projectedProfit = (d.expected_revenue_eur || 0) - (d.confirmed_or_estimated_cost_eur || 0);
            const collectedPct = d.expected_revenue_eur > 0
              ? Math.min(100, Math.round((d.collected_revenue_eur / d.expected_revenue_eur) * 100))
              : 0;
            return (
              <Link key={d.departure_id} href={`/caminos/${d.departure_id}`}>
                <Card className="hover:border-ocre transition-colors h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg">{d.name}</CardTitle>
                        <CardDescription>{d.start_date ?? "Sin fecha"} · {d.pilgrims_count} peregrinos</CardDescription>
                      </div>
                      <Badge variant="muted">{d.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Row label="Ingresos esperados" value={formatEUR(d.expected_revenue_eur)} />
                    <Row label="Cobrado" value={formatEUR(d.collected_revenue_eur)} />
                    <div className="h-2 bg-piedra-suave rounded-full overflow-hidden">
                      <div className="h-full bg-ocre" style={{ width: `${collectedPct}%` }} />
                    </div>
                    <Row label="Costo (estimado/confirmado)" value={formatEUR(d.confirmed_or_estimated_cost_eur)} />
                    <Row label="Falta por pagar" value={formatEUR(payableByDep.get(d.departure_id) ?? 0)} />
                    <Row label="Utilidad proyectada" value={formatEUR(projectedProfit)} bold />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function KPI({ label, value, hint, accent, small }: { label: string; value: string; hint?: string; accent?: boolean; small?: boolean }) {
  return (
    <Card className={accent ? "border-ocre border-2" : undefined}>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={small ? "text-xl font-semibold mt-1" : "text-2xl font-semibold mt-1 font-display"}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
