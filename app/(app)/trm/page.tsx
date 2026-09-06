import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { NewTrmForm } from "@/components/trm/new-trm-form";

export const dynamic = "force-dynamic";

export default async function TrmPage() {
  const supabase = createClient();
  const { data: rates } = await supabase.from("trm_rates").select("*").order("date", { ascending: false }).limit(180);
  const latest = rates?.[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-noche">TRM EUR/COP</h1>
        <p className="text-sm text-muted-foreground">Carga manual de la tasa de cambio</p>
        <div className="brand-yellow-bar mt-2" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">TRM más reciente</CardTitle>
            <CardDescription>{latest ? formatDate(latest.date) : "—"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display">
              {latest ? `${Number(latest.eur_cop).toLocaleString("es-CO")} COP/EUR` : "Sin TRM cargada"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cargar TRM</CardTitle>
            <CardDescription>Una entrada por día.</CardDescription>
          </CardHeader>
          <CardContent>
            <NewTrmForm latestRate={latest?.eur_cop ?? null} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Historial</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(!rates || rates.length === 0) ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Aún no hay TRM cargada.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">TRM EUR/COP</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r: any) => (
                  <TableRow key={r.date}>
                    <TableCell>{formatDate(r.date)}</TableCell>
                    <TableCell className="text-right font-medium">{Number(r.eur_cop).toLocaleString("es-CO")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.notes ?? "—"}</TableCell>
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
