import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatEUR, formatDate, daysUntil, cn } from "@/lib/utils";
import type { PilgrimBalance, UpcomingInstallment } from "@/types/db";

export const dynamic = "force-dynamic";

type Filtro = "proximos" | "vencidos" | "todos";

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "proximos", label: "Próximos pagos" },
  { key: "vencidos", label: "Vencidos" },
  { key: "todos", label: "Todos" },
];

type Row = PilgrimBalance & {
  proximaCuota: UpcomingInstallment | null;
  tieneVencida: boolean;
  tieneProxima: boolean;
};

export default async function PagosPage({ searchParams }: { searchParams: { filtro?: string } }) {
  const filtro: Filtro = (["proximos", "vencidos", "todos"].includes(searchParams.filtro ?? "")
    ? searchParams.filtro
    : "proximos") as Filtro;

  const supabase = createClient();
  const [{ data: balancesData }, { data: upcomingData }] = await Promise.all([
    supabase.from("v_pilgrim_balance").select("*").order("start_date", { ascending: true }),
    supabase.from("v_upcoming_installments").select("*").order("due_date", { ascending: true }),
  ]);

  // Las inscripciones canceladas (retirados) no deben aparecer como deuda pendiente.
  const balances = ((balancesData as PilgrimBalance[]) ?? []).filter((b) => b.status !== "cancelado");
  const upcoming = (upcomingData as UpcomingInstallment[]) ?? [];

  // Agrupar cuotas pendientes/vencidas por inscripción (ya vienen ordenadas por due_date asc)
  const byReg = new Map<string, UpcomingInstallment[]>();
  for (const i of upcoming) {
    const list = byReg.get(i.registration_id) ?? [];
    list.push(i);
    byReg.set(i.registration_id, list);
  }

  let rows: Row[] = balances.map((b) => {
    const cuotas = byReg.get(b.registration_id) ?? [];
    const tieneVencida = cuotas.some((c) => c.status === "vencida" || c.days_until_due < 0);
    const tieneProxima = cuotas.some((c) => c.status === "pendiente" && c.days_until_due >= 0);
    return {
      ...b,
      proximaCuota: cuotas[0] ?? null, // la más próxima (incluye vencidas, que son las más urgentes)
      tieneVencida,
      tieneProxima,
    };
  });

  // Filtro
  if (filtro === "proximos") rows = rows.filter((r) => r.tieneProxima);
  else if (filtro === "vencidos") rows = rows.filter((r) => r.tieneVencida);

  // Orden: por la próxima cuota más próxima; las que no tienen plan, al final
  rows.sort((a, b) => {
    const da = a.proximaCuota?.due_date;
    const db = b.proximaCuota?.due_date;
    if (da && db) return da < db ? -1 : da > db ? 1 : 0;
    if (da) return -1;
    if (db) return 1;
    return a.pilgrim_name.localeCompare(b.pilgrim_name);
  });

  // Resumen global (sobre todas las inscripciones, no sobre el filtro).
  // El saldo sale de la liquidación: con tasa de cierre son los abonos ya
  // re-valorados, y sin recálculo equivale al pendiente histórico.
  const totalPendiente = balances.reduce((s, b) => s + Number(b.por_cobrar_eur || 0), 0);
  const totalPorDevolver = balances.reduce((s, b) => s + Number(b.por_devolver_eur || 0), 0);
  const totalVencido = upcoming
    .filter((i) => i.status === "vencida" || i.days_until_due < 0)
    .reduce((s, i) => s + Number(i.amount_eur || 0), 0);
  const conProximos = balances.filter((b) =>
    (byReg.get(b.registration_id) ?? []).some((c) => c.status === "pendiente" && c.days_until_due >= 0)
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wider text-camino-deepYellow font-medium">Pagos de peregrinos</p>
        <h1 className="font-display text-3xl text-camino-ink">Quién debe y cuándo</h1>
        <div className="brand-yellow-bar mt-2" />
      </div>

      <section className={`grid gap-4 ${totalPorDevolver > 0.5 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <KPI label="Pendiente por cobrar" value={formatEUR(totalPendiente)} hint="De todos los inscritos" accent />
        {totalPorDevolver > 0.5 && (
          <KPI label="Por devolver" value={formatEUR(totalPorDevolver)} hint="Pagaron de más a la tasa de cierre" />
        )}
        <KPI label="Cuotas vencidas" value={formatEUR(totalVencido)} hint="Suma de cuotas pasadas de fecha" />
        <KPI label="Con cuotas próximas" value={String(conProximos)} hint="Inscripciones con cuota futura pendiente" />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {FILTROS.map((f) => (
            <Link
              key={f.key}
              href={`/pagos?filtro=${f.key}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                filtro === f.key
                  ? "bg-camino-yellow text-camino-ink border-camino-yellow font-medium"
                  : "text-muted-foreground hover:bg-cream-100"
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {filtro === "vencidos"
                  ? "No hay cuotas vencidas. 🎉"
                  : filtro === "proximos"
                  ? "No hay cuotas próximas. Definí planes de pago en cada inscripción."
                  : "No hay inscripciones registradas."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Peregrino</TableHead>
                    <TableHead>Camino</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                    <TableHead>Próxima cuota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.registration_id} className="cursor-pointer">
                      <TableCell className="font-medium">
                        <Link href={`/peregrinos/${r.pilgrim_id}`} className="hover:underline">
                          {r.pilgrim_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.departure_name}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatEUR(r.net_total_eur)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatEUR(r.paid_eur)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium">
                        {Number(r.saldo_final_eur) < -0.5 ? (
                          <span className="text-blue-800" title="Pagó de más">
                            −{formatEUR(Math.abs(Number(r.saldo_final_eur)))}
                          </span>
                        ) : (
                          formatEUR(Math.max(0, Number(r.saldo_final_eur)))
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <ProximaCuota cuota={r.proximaCuota} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ProximaCuota({ cuota }: { cuota: UpcomingInstallment | null }) {
  if (!cuota) return <span className="text-muted-foreground">—</span>;
  const days = daysUntil(cuota.due_date);
  const isOverdue = days < 0;
  const isSoon = days >= 0 && days <= 7;
  return (
    <div>
      <div className="text-sm">{cuota.label ?? "Cuota"} · {formatEUR(cuota.amount_eur)}</div>
      <div className={cn("text-xs", isOverdue ? "text-red-700 font-medium" : isSoon ? "text-amber-700" : "text-muted-foreground")}>
        {formatDate(cuota.due_date)}{isOverdue ? ` · ${-days}d vencida` : days === 0 ? " · hoy" : ` · en ${days}d`}
      </div>
    </div>
  );
}

function KPI({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-camino-yellow border-2" : undefined}>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1 font-display">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
