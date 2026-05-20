import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatEUR, formatCOP, formatDate } from "@/lib/utils";
import { NewPaymentDialog } from "@/components/pilgrims/new-payment-dialog";
import { FileText, Download } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PilgrimDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: pilgrim } = await supabase.from("pilgrims").select("*").eq("id", params.id).maybeSingle();
  if (!pilgrim) notFound();

  const { data: registrations } = await supabase
    .from("v_pilgrim_balance")
    .select("*")
    .eq("pilgrim_id", params.id)
    .order("start_date", { ascending: false });

  const regIds = (registrations ?? []).map((r: any) => r.registration_id);

  const { data: payments } = regIds.length
    ? await supabase
        .from("pilgrim_payments")
        .select("*")
        .in("registration_id", regIds)
        .order("paid_at", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/peregrinos" className="text-sm text-muted-foreground hover:underline">← Peregrinos</Link>
        <h1 className="font-display text-3xl text-camino-ink mt-2">{pilgrim.full_name}</h1>
        <div className="text-sm text-muted-foreground mt-1">
          {pilgrim.email ?? ""} {pilgrim.phone ? ` · ${pilgrim.phone}` : ""}
          {pilgrim.country ? ` · ${pilgrim.country}` : ""}
        </div>
        <div className="brand-yellow-bar mt-2" />
      </div>

      <section>
        <h2 className="font-display text-xl text-camino-ink mb-3">Inscripciones</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {(registrations ?? []).map((r: any) => (
            <Card key={r.registration_id}>
              <CardHeader>
                <div className="flex justify-between gap-2">
                  <CardTitle className="text-base">{r.departure_name}</CardTitle>
                  <Badge variant="muted">{r.status}</Badge>
                </div>
                <CardDescription>{formatDate(r.start_date)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Total acordado</span><span>{formatEUR(r.net_total_eur)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pagado</span><span>{formatEUR(r.paid_eur)}</span></div>
                <div className="flex justify-between font-medium"><span>Pendiente EUR</span><span>{formatEUR(r.pending_eur)}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Pendiente COP (ref.)</span><span>{formatCOP(r.pending_cop_reference)}</span></div>
                {r.frozen_trm_eur_cop && (
                  <div className="text-xs text-green-700 mt-1">TRM congelada: {Number(r.frozen_trm_eur_cop).toLocaleString("es-CO")} COP/EUR ({formatDate(r.frozen_trm_date)})</div>
                )}
                <div className="flex gap-2 mt-3 flex-wrap">
                  <NewPaymentDialog registrationId={r.registration_id} departureId={r.departure_id} pilgrimPaysInCop={r.paid_in_cop_originally} />
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/pdf/reporte/${r.registration_id}`} target="_blank">
                      <FileText className="h-4 w-4" /> Reporte
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!registrations || registrations.length === 0) && (
            <Card className="md:col-span-2"><CardContent className="py-8 text-center text-muted-foreground text-sm">Aún no está inscrito en ningún camino. Andá a un camino y agregalo allí.</CardContent></Card>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-camino-ink mb-3">Pagos</h2>
        <Card>
          <CardContent className="p-0">
            {(!payments || payments.length === 0) ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Sin pagos registrados.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">TRM</TableHead>
                    <TableHead className="text-right">EUR</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.paid_at)}</TableCell>
                      <TableCell className="text-right">{Number(p.amount).toLocaleString("es-CO")} {p.currency}</TableCell>
                      <TableCell className="text-right">{p.trm_eur_cop ? Number(p.trm_eur_cop).toLocaleString("es-CO") : "—"}</TableCell>
                      <TableCell className="text-right">{formatEUR(p.amount_eur)}</TableCell>
                      <TableCell>{p.method ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.reference ?? "—"}</TableCell>
                      <TableCell>
                        <a href={`/api/pdf/recibo/${p.id}`} target="_blank" className="text-camino-deepYellow hover:underline text-sm flex items-center gap-1">
                          <Download className="h-3 w-3" /> Recibo
                        </a>
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
