import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EurCop } from "@/components/ui/eur-cop";
import { formatCOP, formatEUR } from "@/lib/utils";
import type { AccountBalance, AccountCurrencyBreakdown } from "@/types/db";

/**
 * Dónde está la plata: saldo por cuenta (Bancolombia, Global 66, Santander…).
 * Para las cuentas que reciben en otra divisa (Global 66 cobra en COP y acredita
 * EUR) muestra el par pagado → recibido con la tasa efectiva del cambio.
 */
export function AccountBalancesCard({
  accounts,
  breakdown = [],
  variant = "full",
  title = "Saldo por cuenta",
}: {
  accounts: AccountBalance[];
  breakdown?: AccountCurrencyBreakdown[];
  variant?: "full" | "compact";
  title?: string;
}) {
  const sorted = [...accounts].sort((a, b) => Number(b.saldo_eur) - Number(a.saldo_eur));
  const totalSaldo = sorted.reduce((s, a) => s + Number(a.saldo_eur ?? 0), 0);

  // Solo interesa el detalle cuando la divisa de origen no es EUR: ahí hubo cambio.
  const conversionesPorCuenta = new Map<string, AccountCurrencyBreakdown[]>();
  for (const b of breakdown) {
    if (b.currency === "EUR") continue;
    const list = conversionesPorCuenta.get(b.account) ?? [];
    list.push(b);
    conversionesPorCuenta.set(b.account, list);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span>{title}</span>
          <span className="text-sm text-muted-foreground">
            Total: <strong className="text-foreground"><EurCop value={totalSaldo} /></strong>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {sorted.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Sin movimientos cargados con cuenta.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                {variant === "full" && (
                  <>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Pagos proveedores</TableHead>
                    <TableHead className="text-right">Operativos</TableHead>
                    <TableHead className="text-right">Personales</TableHead>
                  </>
                )}
                {variant === "compact" && <TableHead className="text-right">Ingresos</TableHead>}
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((a) => {
                const saldo = Number(a.saldo_eur ?? 0);
                const conversiones = conversionesPorCuenta.get(a.account) ?? [];
                return (
                  <TableRow key={a.account}>
                    <TableCell className="font-medium align-top">
                      {a.account}
                      {conversiones.map((c) => (
                        <div key={`${c.direction}-${c.currency}`} className="text-[11px] font-normal text-muted-foreground mt-0.5">
                          {c.direction === "ingreso" ? "Entró" : "Salió"} {formatCOP(Number(c.monto_origen))}{" "}
                          {c.currency !== "COP" ? `${c.currency} ` : ""}→ {formatEUR(Number(c.monto_eur))}
                          {c.tasa_promedio != null && (
                            <> · tasa {Number(c.tasa_promedio).toLocaleString("es-CO", { maximumFractionDigits: 0 })}</>
                          )}
                        </div>
                      ))}
                    </TableCell>
                    {variant === "full" && (
                      <>
                        <TableCell className="text-right text-green-700 align-top"><EurCop value={a.ingresos_eur} /></TableCell>
                        <TableCell className="text-right align-top"><EurCop value={a.egresos_proveedores_eur} /></TableCell>
                        <TableCell className="text-right align-top"><EurCop value={a.egresos_operativos_eur} /></TableCell>
                        <TableCell className="text-right text-muted-foreground align-top"><EurCop value={a.egresos_personales_eur} /></TableCell>
                      </>
                    )}
                    {variant === "compact" && (
                      <TableCell className="text-right text-green-700 align-top"><EurCop value={a.ingresos_eur} /></TableCell>
                    )}
                    <TableCell className={`text-right font-semibold align-top ${saldo < 0 ? "text-red-700" : "text-foreground"}`}>
                      <EurCop value={saldo} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
