import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EurCop } from "@/components/ui/eur-cop";
import { formatEUR } from "@/lib/utils";
import { NewPaymentDialog } from "@/components/pilgrims/new-payment-dialog";
import { RegisterReservationPayment } from "@/components/departures/register-reservation-payment";
import { EditBudgetItemDialog } from "@/components/departures/edit-budget-item-dialog";
import { TrendingUp, TrendingDown } from "lucide-react";

export async function PagosTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [
    { data: finance },
    { data: payable },
    { data: pilgrims },
    { data: reservations },
    { data: resPayments },
    { data: budgetItems },
    { data: budgetPayable },
    { data: providers },
  ] = await Promise.all([
    supabase.from("v_departure_finance").select("expected_revenue_eur, collected_revenue_eur, pending_revenue_eur, pending_settled_eur, por_devolver_eur, fx_difference_eur, liquidados_count, trm_frozen_value, settlement_mode").eq("departure_id", departureId).maybeSingle(),
    supabase.from("v_departure_payable").select("*").eq("departure_id", departureId).maybeSingle(),
    supabase.from("v_pilgrim_balance").select("*").eq("departure_id", departureId).order("pilgrim_name"),
    supabase.from("reservations").select("id, provider_id, departure_id, type, location, estimated_cost_eur, confirmed_cost_eur, status, providers(name)").eq("departure_id", departureId).neq("status", "cancelado").order("check_in", { ascending: true, nullsFirst: false }),
    supabase.from("v_reservation_payments").select("reservation_id, paid_eur, paid_pct, saldo_eur").eq("departure_id", departureId),
    supabase.from("budget_items").select("*").eq("departure_id", departureId).is("reservation_id", null).neq("status", "cancelado").order("item_date", { ascending: true, nullsFirst: false }),
    supabase.from("v_budget_payable").select("budget_item_id, saldo_eur, paid_eur, line_total_eur").eq("departure_id", departureId).is("reservation_id", null),
    supabase.from("providers").select("id, name, type").eq("active", true).order("name"),
  ]);

  const activos = (pilgrims ?? []).filter((r: any) => r.status !== "cancelado");
  const esperado = Number((finance as any)?.expected_revenue_eur ?? 0);
  const cobrado = Number((finance as any)?.collected_revenue_eur ?? 0);
  // Con tasa de cierre fijada, lo que falta cobrar sale de la liquidación: los
  // abonos en pesos ya re-valorados. Sin ella, del pendiente histórico.
  const hayCierre =
    ((finance as any)?.settlement_mode ?? "recalculo") === "recalculo" &&
    Number((finance as any)?.trm_frozen_value ?? 0) > 0;
  const faltaCobrar = hayCierre
    ? Number((finance as any)?.pending_settled_eur ?? 0)
    : Number((finance as any)?.pending_revenue_eur ?? 0);
  const porDevolver = Number((finance as any)?.por_devolver_eur ?? 0);
  const difCambio = Number((finance as any)?.fx_difference_eur ?? 0);

  const costo = Number((payable as any)?.total_modelo_eur ?? 0);
  const pagado = Number((payable as any)?.pagado_real_eur ?? 0);
  const faltaPagar = Number((payable as any)?.falta_por_pagar_eur ?? 0);

  const resPayByid = new Map<string, { paid_eur: number; paid_pct: number; saldo_eur: number }>();
  (resPayments ?? []).forEach((p: any) => resPayByid.set(p.reservation_id, {
    paid_eur: Number(p.paid_eur ?? 0), paid_pct: Number(p.paid_pct ?? 0), saldo_eur: Number(p.saldo_eur ?? 0),
  }));

  const budgetPayByid = new Map<string, { saldo: number; paid: number; total: number }>();
  (budgetPayable ?? []).forEach((b: any) => budgetPayByid.set(b.budget_item_id, {
    saldo: Number(b.saldo_eur ?? 0), paid: Number(b.paid_eur ?? 0), total: Number(b.line_total_eur ?? 0),
  }));

  // Ítems de presupuesto sin reserva que aún tienen saldo (viáticos, tiquetes, materiales…)
  const pendientesPresupuesto = (budgetItems ?? []).filter((b: any) => (budgetPayByid.get(b.id)?.saldo ?? 0) > 0.01);

  return (
    <div className="space-y-8">
      {/* ===== INGRESOS ===== */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-ok-700" />
          <h2 className="font-display text-lg text-noche">Lo que entra — abonos de peregrinos</h2>
        </div>
        <div className={`grid gap-3 ${hayCierre ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3"}`}>
          <SummaryCard label="Esperado" value={<EurCop value={esperado} />} />
          <SummaryCard label="Cobrado" value={<EurCop value={cobrado} />} tone="green" />
          <SummaryCard
            label={hayCierre ? "Falta por cobrar (liquidado)" : "Falta por cobrar"}
            value={<EurCop value={faltaCobrar} />}
            tone="amber"
          />
          {hayCierre && (
            <SummaryCard label="Por devolver" value={<EurCop value={porDevolver} />} tone="amber" />
          )}
        </div>
        {hayCierre && Math.abs(difCambio) > 0.5 && (
          <p className="text-xs text-muted-foreground">
            Diferencia en cambio de la salida:{" "}
            <strong className={difCambio > 0 ? "text-error-700" : "text-ok-700"}>
              {difCambio > 0 ? "−" : "+"}{formatEUR(Math.abs(difCambio))}
            </strong>{" "}
            — lo que se movió la tasa entre el día de cada abono y el cierre. Ver{" "}
            <Link href={`/caminos/${departureId}?tab=liquidacion`} className="underline">Liquidación</Link>.
          </p>
        )}
        <Card>
          <CardContent className="p-0">
            {activos.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Aún no hay peregrinos en este camino.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Peregrino</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead className="text-right">Falta</TableHead>
                    <TableHead className="text-right">Registrar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activos.map((r: any) => {
                    const conCierre = r.settlement_trm != null;
                    const saldo = conCierre ? Number(r.saldo_final_eur) : Number(r.pending_eur);
                    const saldado = Math.abs(saldo) <= (conCierre ? 0.5 : 0.01);
                    const devolver = conCierre && saldo < -0.5;
                    return (
                      <TableRow key={r.registration_id}>
                        <TableCell>
                          <Link href={`/peregrinos/${r.pilgrim_id}`} className="hover:underline font-medium">{r.pilgrim_name}</Link>
                        </TableCell>
                        <TableCell className="text-right">{formatEUR(r.net_total_eur)}</TableCell>
                        <TableCell className="text-right text-ok-700">{formatEUR(r.paid_eur)}</TableCell>
                        <TableCell className="text-right">
                          {saldado ? (
                            <Badge variant="success">al día</Badge>
                          ) : devolver ? (
                            <span className="text-info-800 font-medium" title="Pagó de más a la tasa de cierre">
                              −{formatEUR(Math.abs(saldo))}
                            </span>
                          ) : (
                            <span className="text-aviso-700 font-medium">{formatEUR(saldo)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <NewPaymentDialog registrationId={r.registration_id} departureId={departureId} pilgrimPaysInCop={r.paid_in_cop_originally} settlementTrm={r.settlement_trm} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ===== EGRESOS ===== */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-aviso-700" />
          <h2 className="font-display text-lg text-noche">Lo que sale — pagos a proveedores y equipo</h2>
        </div>
        <div className="grid gap-3 grid-cols-3">
          <SummaryCard label="Costo total" value={<EurCop value={costo} />} />
          <SummaryCard label="Pagado" value={<EurCop value={pagado} />} tone="green" />
          <SummaryCard label="Falta por pagar" value={<EurCop value={faltaPagar} />} tone="amber" />
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Reservas a proveedores</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(!reservations || reservations.length === 0) ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No hay reservas todavía. Se crean en la pestaña Reservas.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor / Lugar</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Registrar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservations.map((r: any) => {
                    const pay = resPayByid.get(r.id);
                    const costoRes = Number(r.confirmed_cost_eur ?? r.estimated_cost_eur ?? 0);
                    const saldo = pay ? pay.saldo_eur : costoRes;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.providers?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.location ?? r.type}</div>
                        </TableCell>
                        <TableCell className="text-right"><EurCop value={costoRes} /></TableCell>
                        <TableCell className="text-right">
                          {pay && pay.paid_eur > 0 ? (
                            <div>
                              <div className="text-ok-700 text-sm">{formatEUR(pay.paid_eur)}</div>
                              <div className="text-[10px] text-muted-foreground">{pay.paid_pct}%</div>
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium text-aviso-800">{saldo > 0.01 ? <EurCop value={saldo} /> : <Badge variant="success">pagado</Badge>}</TableCell>
                        <TableCell><Badge variant={r.status === "pagado" ? "success" : r.status === "reservado" ? "accent" : "muted"}>{r.status}</Badge></TableCell>
                        <TableCell className="text-right"><RegisterReservationPayment reservation={r} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Viáticos, tiquetes y otros del presupuesto</CardTitle></CardHeader>
          <CardContent className="p-0">
            {pendientesPresupuesto.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Sin pendientes del presupuesto fuera de reservas.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ítem</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Registrar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendientesPresupuesto.map((b: any) => {
                    const pay = budgetPayByid.get(b.id)!;
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="font-medium">{b.description}</div>
                          <div className="text-xs text-muted-foreground">{b.category}</div>
                        </TableCell>
                        <TableCell>{b.scaling === "viatico_team" ? <Badge variant="warning">Viático equipo</Badge> : <Badge variant="muted">{b.category}</Badge>}</TableCell>
                        <TableCell className="text-right"><EurCop value={pay.total} /></TableCell>
                        <TableCell className="text-right">{pay.paid > 0 ? <span className="text-ok-700 text-sm">{formatEUR(pay.paid)}</span> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                        <TableCell className="text-right font-medium text-aviso-800"><EurCop value={pay.saldo} /></TableCell>
                        <TableCell className="text-right"><EditBudgetItemDialog item={b} providers={providers ?? []} departureId={departureId} lockScaling={b.scaling === "viatico_team"} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "green" | "amber" }) {
  const cls = tone === "green" ? "border-ok-200" : tone === "amber" ? "border-aviso-200" : "";
  const txt = tone === "green" ? "text-ok-700" : tone === "amber" ? "text-aviso-800" : "";
  return (
    <Card className={cls}>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-base sm:text-xl font-display font-semibold mt-1 ${txt}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
