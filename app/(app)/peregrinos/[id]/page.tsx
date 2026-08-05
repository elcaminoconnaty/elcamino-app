import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatEUR, formatCOP, formatDate } from "@/lib/utils";
import { NewPaymentDialog } from "@/components/pilgrims/new-payment-dialog";
import { EditPilgrimDialog } from "@/components/pilgrims/edit-pilgrim-form";
import { DeletePilgrimDialog } from "@/components/pilgrims/delete-pilgrim-dialog";
import { EditRegistrationDialog } from "@/components/pilgrims/edit-registration-dialog";
import { EditPaymentDialog } from "@/components/pilgrims/edit-payment-dialog";
import { PaymentPlanCard } from "@/components/pilgrims/payment-plan-card";
import { PassportUpload } from "@/components/pilgrims/passport-upload";
import { PaymentSummary } from "@/components/pilgrims/payment-summary";
import { UpcomingPaymentsCard } from "@/components/pilgrims/upcoming-payments-card";
import { EurCop } from "@/components/ui/eur-cop";
import type { UpcomingInstallment } from "@/types/db";
import { FileText, Download, Mail, Phone, MapPin, Heart, AlertCircle } from "lucide-react";

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
        .order("paid_at", { ascending: true })
    : { data: [] };

  const { data: upcoming } = await supabase
    .from("v_upcoming_installments")
    .select("*")
    .eq("pilgrim_id", params.id)
    .order("due_date", { ascending: true });
  const upcomingInstallments = (upcoming as UpcomingInstallment[]) ?? [];

  const [{ data: departures }, { data: regNotes }] = await Promise.all([
    supabase
      .from("departures")
      .select("id, name, start_date, status")
      .neq("status", "cancelled")
      .order("start_date", { ascending: false }),
    regIds.length
      ? supabase.from("registrations").select("id, notes").in("id", regIds)
      : Promise.resolve({ data: [] as { id: string; notes: string | null }[] }),
  ]);
  const notesByReg = new Map((regNotes ?? []).map((r: any) => [r.id, r.notes]));

  const paidEur = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount_eur || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/peregrinos" className="text-sm text-muted-foreground hover:underline">← Peregrinos</Link>
        <div className="flex items-start justify-between mt-2 gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl text-camino-ink break-words">
              {pilgrim.full_name}
              {pilgrim.deleted_at && <Badge variant="muted" className="ml-2 align-middle">Eliminado — abonos retenidos</Badge>}
            </h1>
            <div className="text-sm text-muted-foreground mt-1">
              {pilgrim.country ? pilgrim.country : ""}
              {pilgrim.document_id ? ` · ${pilgrim.document_id}` : ""}
            </div>
            <div className="brand-yellow-bar mt-2" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <EditPilgrimDialog pilgrim={pilgrim} />
            <DeletePilgrimDialog
              pilgrimId={pilgrim.id}
              pilgrimName={pilgrim.full_name}
              paymentsCount={payments?.length ?? 0}
              paidEur={paidEur}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Contacto</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span>{pilgrim.email ?? "—"}</span></div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span>{pilgrim.phone ?? "—"}</span></div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><span>{pilgrim.country ?? "—"}</span></div>
            {pilgrim.birth_date && <div className="text-xs text-muted-foreground">Nacimiento: {formatDate(pilgrim.birth_date)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Emergencia</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-muted-foreground" /><span>{pilgrim.emergency_contact_name ?? "—"}</span></div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span>{pilgrim.emergency_contact_phone ?? "—"}</span></div>
            {pilgrim.dietary_notes && (
              <div className="flex items-start gap-2 pt-2 border-t mt-2">
                <Heart className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-xs">{pilgrim.dietary_notes}</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Pasaporte / Datos</CardTitle></CardHeader>
          <CardContent>
            <PassportUpload pilgrim={pilgrim} />
          </CardContent>
        </Card>
      </div>

      <UpcomingPaymentsCard installments={upcomingInstallments} />

      <section>
        <h2 className="font-display text-xl text-camino-ink mb-3">Inscripciones</h2>
        <div className="grid gap-3 lg:grid-cols-2">
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
                <div className="flex justify-between"><span className="text-muted-foreground">Total acordado</span><span><EurCop value={r.net_total_eur} /></span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pagado</span><span><EurCop value={r.paid_eur} /></span></div>
                <div className="flex justify-between font-medium"><span>Pendiente</span><span><EurCop value={r.pending_eur} /></span></div>
                {r.frozen_trm_eur_cop && (
                  <div className="text-xs text-green-700 mt-1">TRM congelada: {Number(r.frozen_trm_eur_cop).toLocaleString("es-CO")} COP/EUR ({formatDate(r.frozen_trm_date)})</div>
                )}
                <div className="mt-3">
                  <PaymentPlanCard registrationId={r.registration_id} totalEur={r.net_total_eur} departureStartDate={r.start_date} />
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <NewPaymentDialog registrationId={r.registration_id} departureId={r.departure_id} pilgrimPaysInCop={r.paid_in_cop_originally} />
                  <EditRegistrationDialog
                    registration={{
                      registration_id: r.registration_id,
                      departure_id: r.departure_id,
                      total_eur: Number(r.total_eur ?? r.net_total_eur ?? 0),
                      discount_eur: Number(r.discount_eur ?? 0),
                      status: r.status,
                      paid_in_cop_originally: r.paid_in_cop_originally,
                      notes: notesByReg.get(r.registration_id) ?? null,
                    }}
                    departures={departures ?? []}
                  />
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

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
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
                      <TableHead className="text-right">Tasa</TableHead>
                      <TableHead className="text-right">EUR</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(p.paid_at)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{Number(p.amount).toLocaleString("es-CO")} {p.currency}</TableCell>
                        <TableCell className="text-right">{p.trm_eur_cop ? Number(p.trm_eur_cop).toLocaleString("es-CO") : "—"}</TableCell>
                        <TableCell className="text-right">{formatEUR(p.amount_eur)}</TableCell>
                        <TableCell className="text-xs">{p.account ?? "—"}</TableCell>
                        <TableCell className="text-xs">{p.method ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <EditPaymentDialog payment={p} />
                            <a href={`/api/pdf/recibo/${p.id}`} target="_blank" className="text-camino-deepYellow hover:underline text-xs flex items-center gap-1 px-2">
                              <Download className="h-3 w-3" /> PDF
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
        <PaymentSummary
          payments={payments ?? []}
          totalEur={(registrations ?? []).reduce((s: number, r: any) => s + Number(r.net_total_eur || 0), 0)}
        />
      </section>
    </div>
  );
}
