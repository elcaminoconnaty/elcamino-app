import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEUR, formatDate, daysUntil } from "@/lib/utils";
import type { UpcomingInstallment } from "@/types/db";

export function UpcomingPaymentsCard({ installments }: { installments: UpcomingInstallment[] }) {
  const total = installments.reduce((s, i) => s + Number(i.amount_eur || 0), 0);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-end justify-between gap-2">
          <CardTitle className="text-base">Próximos pagos</CardTitle>
          {installments.length > 0 && (
            <span className="text-sm text-muted-foreground">Total {formatEUR(total)}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {installments.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Sin cuotas pendientes próximas.</div>
        ) : (
          <div className="divide-y border-t">
            {installments.map((i) => {
              const days = daysUntil(i.due_date);
              const isOverdue = days < 0;
              const isSoon = days >= 0 && days <= 7;
              return (
                <div key={i.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{i.label ?? "Cuota"}</div>
                    <div className="text-xs text-muted-foreground truncate">{i.departure_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium">{formatEUR(i.amount_eur)}</div>
                    <div className={`text-xs ${isOverdue ? "text-error-700 font-medium" : isSoon ? "text-aviso-700" : "text-muted-foreground"}`}>
                      {formatDate(i.due_date)}{isOverdue ? ` · ${-days}d vencida` : days === 0 ? " · hoy" : ` · en ${days}d`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
