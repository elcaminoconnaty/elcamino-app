import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatEUR } from "@/lib/utils";
import { NewExpenseDialog } from "@/components/expenses/new-expense-dialog";
import { EditExpenseDialog } from "@/components/expenses/edit-expense-dialog";
import { ExpensesFilters } from "@/components/expenses/expenses-filters";
import { TrendingUp, TrendingDown, Wallet, ExternalLink, AlertCircle } from "lucide-react";
import { EurCop, TrmSelector } from "@/components/ui/eur-cop";

export const dynamic = "force-dynamic";

const KIND_BADGE: Record<string, "warning" | "muted" | "accent" | "success"> = {
  operativo: "muted",
  personal: "warning",
  pago_proveedor: "accent",
};

const KIND_LABEL: Record<string, string> = {
  operativo: "Operativo",
  personal: "Personal",
  pago_proveedor: "Pago proveedor",
};

export default async function GastosPage({ searchParams }: { searchParams: { kind?: string; departure_id?: string } }) {
  const supabase = createClient();
  const { kind, departure_id } = searchParams;

  let mq = supabase
    .from("v_all_movements")
    .select("*")
    .order("movement_date", { ascending: true })
    .limit(800);
  if (kind) mq = mq.eq("kind", kind);
  if (departure_id) mq = mq.eq("departure_id", departure_id);

  let pq = supabase
    .from("v_pending_payments")
    .select("*")
    .gt("saldo_eur", 0.01)
    .order("next_due_date", { ascending: true, nullsFirst: false })
    .order("check_in", { ascending: true, nullsFirst: false });
  if (departure_id) pq = pq.eq("departure_id", departure_id);

  const [
    { data: movements },
    { data: departures },
    { data: providers },
    { data: accounts },
    { data: global },
    { data: pending },
  ] = await Promise.all([
    mq,
    supabase.from("departures").select("id, name").order("start_date"),
    supabase.from("providers").select("id, name"),
    supabase.from("v_account_balances").select("*"),
    supabase.from("v_financial_global").select("*").maybeSingle(),
    pq,
  ]);

  const depByid = new Map<string, string>();
  (departures ?? []).forEach((d: any) => depByid.set(d.id, d.name));
  const provByid = new Map<string, string>();
  (providers ?? []).forEach((p: any) => provByid.set(p.id, p.name));

  const totalEur = (movements ?? []).reduce((s: number, r: any) => s + Number(r.amount_eur || 0), 0);
  const totalOp = (movements ?? []).filter((r: any) => r.kind === "operativo").reduce((s: number, r: any) => s + Number(r.amount_eur || 0), 0);
  const totalPersonal = (movements ?? []).filter((r: any) => r.kind === "personal").reduce((s: number, r: any) => s + Number(r.amount_eur || 0), 0);
  const totalProveedores = (movements ?? []).filter((r: any) => r.kind === "pago_proveedor").reduce((s: number, r: any) => s + Number(r.amount_eur || 0), 0);

  const g = (global as any) ?? {};
  const collected = Number(g.collected_eur ?? 0);
  const paidProviders = Number(g.paid_providers_eur ?? 0);
  const opsExpenses = Number(g.operational_expenses_eur ?? 0);
  const personalExp = Number(g.personal_withdrawals_eur ?? 0);
  const realizedProfit = Number(g.realized_operational_profit_eur ?? 0);
  const cashAvailable = Number(g.cash_available_eur ?? 0);

  const sortedAccounts = (accounts ?? []).slice().sort((a: any, b: any) => Number(b.saldo_eur) - Number(a.saldo_eur));
  const totalSaldo = sortedAccounts.reduce((s: number, a: any) => s + Number(a.saldo_eur ?? 0), 0);

  const totalPending = (pending ?? []).reduce((s: number, p: any) => s + Number(p.saldo_eur || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-camino-ink">Gastos y movimientos</h1>
          <p className="text-sm text-muted-foreground">{movements?.length ?? 0} movimientos · gastos + pagos a proveedores</p>
          <div className="brand-yellow-bar mt-2" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TrmSelector />
          <NewExpenseDialog departures={departures ?? []} defaultDepartureId={departure_id} />
        </div>
      </div>

      <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-5">
        <Card className="border-green-200 border-2">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-green-900">
              <TrendingUp className="h-3 w-3" /> Ingresado
            </div>
            <div className="text-lg sm:text-2xl font-display font-semibold mt-1 text-green-900"><EurCop value={collected} /></div>
            <div className="text-[11px] sm:text-xs text-muted-foreground">cobros peregrinos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <TrendingDown className="h-3 w-3" /> Pagado proveedores
            </div>
            <div className="text-lg sm:text-2xl font-display font-semibold mt-1"><EurCop value={paidProviders} /></div>
            <div className="text-[11px] sm:text-xs text-muted-foreground">+ <EurCop value={opsExpenses} /> operativos</div>
          </CardContent>
        </Card>
        <Card className="border-amber-300 border-2">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-900">
              <AlertCircle className="h-3 w-3" /> Pendiente por pagar
            </div>
            <div className="text-lg sm:text-2xl font-display font-semibold mt-1 text-amber-900"><EurCop value={totalPending} /></div>
            <div className="text-[11px] sm:text-xs text-muted-foreground">{pending?.length ?? 0} reservas con saldo</div>
          </CardContent>
        </Card>
        <Card className={realizedProfit >= 0 ? "border-green-200 border-2" : "border-red-200 border-2"}>
          <CardContent className="p-3 sm:p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Utilidad realizada</div>
            <div className={`text-lg sm:text-2xl font-display font-semibold mt-1 ${realizedProfit >= 0 ? "text-green-700" : "text-red-700"}`}><EurCop value={realizedProfit} /></div>
            <div className="text-[11px] sm:text-xs text-muted-foreground">ingreso − proveedores − operativo</div>
          </CardContent>
        </Card>
        <Card className="border-camino-yellow border-2 col-span-2 lg:col-span-1">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-camino-ink">
              <Wallet className="h-3 w-3" /> Caja disponible
            </div>
            <div className="text-lg sm:text-2xl font-display font-semibold mt-1"><EurCop value={cashAvailable} /></div>
            <div className="text-[11px] sm:text-xs text-muted-foreground">menos retiros <EurCop value={personalExp} /></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span>Saldo por cuenta</span>
            <span className="text-sm text-muted-foreground">Total: <strong className="text-foreground"><EurCop value={totalSaldo} /></strong></span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sortedAccounts.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Sin movimientos cargados con cuenta.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Pagos proveedores</TableHead>
                  <TableHead className="text-right">Operativos</TableHead>
                  <TableHead className="text-right">Personales</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAccounts.map((a: any) => {
                  const saldo = Number(a.saldo_eur ?? 0);
                  return (
                    <TableRow key={a.account}>
                      <TableCell className="font-medium">{a.account}</TableCell>
                      <TableCell className="text-right text-green-700"><EurCop value={a.ingresos_eur} /></TableCell>
                      <TableCell className="text-right"><EurCop value={a.egresos_proveedores_eur} /></TableCell>
                      <TableCell className="text-right"><EurCop value={a.egresos_operativos_eur} /></TableCell>
                      <TableCell className="text-right text-muted-foreground"><EurCop value={a.egresos_personales_eur} /></TableCell>
                      <TableCell className={`text-right font-semibold ${saldo < 0 ? "text-red-700" : "text-foreground"}`}><EurCop value={saldo} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-300 border-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-700" /> Pendiente por pagar a proveedores</span>
            <span className="text-sm text-muted-foreground">Total: <strong className="text-amber-900"><EurCop value={totalPending} /></strong></span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!pending || pending.length === 0) ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Todo al día. No hay saldos pendientes.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Próximo pago</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Proveedor / Lugar</TableHead>
                  <TableHead>Camino</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((p: any) => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const dueDate = p.next_due_date ? new Date(p.next_due_date) : null;
                  const days = dueDate ? Math.round((dueDate.getTime() - today.getTime()) / 86_400_000) : null;
                  const overdue = days !== null && days < 0;
                  const soon = days !== null && days >= 0 && days <= 14;
                  return (
                    <TableRow key={p.reservation_id} className={overdue ? "bg-red-50" : soon ? "bg-amber-50" : undefined}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {p.next_due_date ? (
                          <>
                            <div className={`font-medium ${overdue ? "text-red-700" : soon ? "text-amber-700" : ""}`}>{formatDate(p.next_due_date)}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {p.next_due_label ? `${p.next_due_label} · ` : ""}<EurCop value={p.next_due_amount_eur} hideZeroCop />
                              {days !== null && (
                                <span className={`ml-1 ${overdue ? "text-red-700" : ""}`}>
                                  ({overdue ? `${Math.abs(days)}d vencido` : days === 0 ? "hoy" : `en ${days}d`})
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sin plan</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(p.check_in)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{provByid.get(p.provider_id) ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{p.type} {p.location ? `· ${p.location}` : ""}</div>
                      </TableCell>
                      <TableCell className="text-sm">{depByid.get(p.departure_id) ?? "—"}</TableCell>
                      <TableCell><Badge variant={p.status === "reservado" ? "accent" : p.status === "enviado" ? "muted" : "warning"}>{p.status}</Badge></TableCell>
                      <TableCell className="text-right text-sm"><EurCop value={p.cost_eur} /></TableCell>
                      <TableCell className="text-right text-sm">
                        {Number(p.paid_eur) > 0 ? (
                          <>
                            <div className="text-green-700"><EurCop value={p.paid_eur} hideZeroCop /></div>
                            <div className="text-[10px] text-muted-foreground">{Number(p.paid_pct).toFixed(1)}%</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-amber-900"><EurCop value={p.saldo_eur} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Movimientos del periodo filtrado</div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-3">
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div><div className="text-base sm:text-xl font-display mt-1"><EurCop value={totalEur} /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground uppercase tracking-wider">Pagos proveedores</div><div className="text-base sm:text-xl font-display mt-1"><EurCop value={totalProveedores} /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground uppercase tracking-wider">Operativo</div><div className="text-base sm:text-xl font-display mt-1"><EurCop value={totalOp} /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground uppercase tracking-wider">Personal (Naty)</div><div className="text-base sm:text-xl font-display mt-1"><EurCop value={totalPersonal} /></div></CardContent></Card>
        </div>
        <ExpensesFilters departures={departures ?? []} />
      </div>

      <Card>
        <CardContent className="p-0">
          {(!movements || movements.length === 0) ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Sin movimientos.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoría / Proveedor</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Camino</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">EUR / COP</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m: any) => (
                  <TableRow key={m.row_id} className={m.source === "provider_payment" ? "bg-cream-50/50" : undefined}>
                    <TableCell className="whitespace-nowrap">{formatDate(m.movement_date)}</TableCell>
                    <TableCell><Badge variant={KIND_BADGE[m.kind] ?? "muted"}>{KIND_LABEL[m.kind] ?? m.kind}</Badge></TableCell>
                    <TableCell>{m.category ?? "—"}</TableCell>
                    <TableCell>{m.description ?? "—"}</TableCell>
                    <TableCell className="text-sm">{m.departure_id ? depByid.get(m.departure_id) ?? "—" : "—"}</TableCell>
                    <TableCell className="text-xs">{m.account ?? "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{Number(m.amount).toLocaleString("es-CO")} {m.currency}</TableCell>
                    <TableCell className="text-right font-medium"><EurCop value={m.amount_eur} /></TableCell>
                    <TableCell>
                      {m.source === "expense" ? (
                        <EditExpenseDialog expense={{
                          id: m.source_id,
                          expense_date: m.movement_date,
                          kind: m.kind,
                          category: m.category,
                          description: m.description,
                          amount: m.amount,
                          currency: m.currency,
                          amount_eur: m.amount_eur,
                          payment_method: m.method,
                          account: m.account,
                          departure_id: m.departure_id,
                          notes: m.notes,
                        }} departures={departures ?? []} />
                      ) : m.provider_id ? (
                        <Link href={`/proveedores/${m.provider_id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-camino-ink hover:underline">
                          <ExternalLink className="h-3 w-3" /> ver
                        </Link>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
