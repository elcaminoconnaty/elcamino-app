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
import { SettlementCard } from "@/components/pilgrims/settlement-card";
import { UpcomingPaymentsCard } from "@/components/pilgrims/upcoming-payments-card";
import { ContractCard, type EstadoContrato } from "@/components/pilgrims/contract-card";
import { revisarContrato } from "@/lib/actions/contracts";
import type { RevisionContrato } from "@/lib/contracts/datos";
import { EurCop } from "@/components/ui/eur-cop";
import type { UpcomingInstallment } from "@/types/db";
import { PAYMENT_KIND, motivoSinRecalculo, type PilgrimSettlement, type PaymentSettlement } from "@/lib/settlement";
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

  // Los pagos se leen de la vista de liquidación: trae cada uno con su tasa
  // histórica intacta y, además, su valor re-valorado a la tasa de cierre.
  const { data: payments } = regIds.length
    ? await supabase
        .from("v_pilgrim_payment_settlement")
        .select("*")
        .in("registration_id", regIds)
        .order("paid_at", { ascending: true })
    : { data: [] };
  const pagos = (payments as PaymentSettlement[]) ?? [];

  const { data: settlementRows } = regIds.length
    ? await supabase.from("v_pilgrim_settlement").select("*").in("registration_id", regIds)
    : { data: [] };
  const settlementByReg = new Map(
    ((settlementRows as PilgrimSettlement[]) ?? []).map((r) => [r.registration_id, r])
  );
  // Con tasa de cierre puesta, al menos una inscripción tiene algo que liquidar.
  const hayTasaDeCierre = ((settlementRows as PilgrimSettlement[]) ?? []).some((r) => r.settlement_trm != null);

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

  // Contratos: el vigente por inscripción, y qué falta para poder emitirlo.
  const { data: contratos } = regIds.length
    ? await supabase
        .from("contracts")
        .select("id, registration_id, status, version, access_token, sent_at, viewed_at, signed_at, pdf_signed_sha256")
        .in("registration_id", regIds)
        .in("status", ["borrador", "enviado", "visto", "firmado"])
    : { data: [] as any[] };

  const contratoByReg = new Map<string, EstadoContrato>(
    (contratos ?? []).map((c: any) => [
      c.registration_id,
      {
        id: c.id,
        status: c.status,
        version: c.version,
        codigo: String(c.access_token).slice(0, 8).toUpperCase(),
        sentAt: c.sent_at,
        viewedAt: c.viewed_at,
        signedAt: c.signed_at,
        huella: c.pdf_signed_sha256,
        urlVerificacion: c.pdf_signed_sha256
          ? `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/verificar/${c.pdf_signed_sha256}`
          : null,
      },
    ])
  );

  // `revisarContrato` solo lee: dice qué falta sin escribir nada.
  const revisiones = new Map<string, RevisionContrato>(
    await Promise.all(
      regIds.map(async (id: string): Promise<[string, RevisionContrato]> => {
        try {
          return [id, await revisarContrato(id)];
        } catch {
          // Si algo falla al leer, la tarjeta muestra el contrato sin avisos en vez de
          // tumbar la página entera del peregrino.
          return [id, { pendientes: [], avisos: [], datos: {}, listo: false }];
        }
      })
    )
  );

  const paidEur = pagos.reduce((acc, p) => acc + Number(p.amount_eur || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/peregrinos" className="text-sm text-muted-foreground hover:underline">← Peregrinos</Link>
        <div className="flex items-start justify-between mt-2 gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl text-noche break-words">
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
        <h2 className="font-display text-xl text-noche mb-3">Inscripciones</h2>
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
                {Number(r.penalty_eur) > 0 ? (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Precio del viaje</span><span><EurCop value={Number(r.net_total_eur) - Number(r.penalty_eur)} /></span></div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Penalidad
                        {r.penalty_note && <span className="block text-[11px] leading-tight">{r.penalty_note}</span>}
                      </span>
                      <span className="text-aviso-800">+ <EurCop value={r.penalty_eur} /></span>
                    </div>
                    <div className="flex justify-between font-medium"><span>Total acordado</span><span><EurCop value={r.net_total_eur} /></span></div>
                  </>
                ) : (
                  <div className="flex justify-between"><span className="text-muted-foreground">Total acordado</span><span><EurCop value={r.net_total_eur} /></span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Pagado (euros que entraron)</span><span><EurCop value={r.paid_eur} /></span></div>
                {r.settlement_trm ? (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Acreditado a la tasa de cierre</span><span><EurCop value={r.paid_eur_cierre} /></span></div>
                    <div className="flex justify-between font-medium">
                      <span>{Number(r.saldo_final_eur) < -0.5 ? "A favor del peregrino" : "Pendiente"}</span>
                      <span><EurCop value={Math.abs(Number(r.saldo_final_eur))} /></span>
                    </div>
                    <div className="text-xs text-ok-700 mt-1">
                      Tasa de cierre: {Number(r.settlement_trm).toLocaleString("es-CO")} COP/EUR ({formatDate(r.settlement_date)})
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between font-medium"><span>Pendiente</span><span><EurCop value={r.pending_eur} /></span></div>
                )}
                <div className="mt-3">
                  <PaymentPlanCard registrationId={r.registration_id} totalEur={r.net_total_eur} departureStartDate={r.start_date} />
                </div>
                <ContractCard
                  registrationId={r.registration_id}
                  pilgrimId={params.id}
                  contrato={contratoByReg.get(r.registration_id) ?? null}
                  pendientes={revisiones.get(r.registration_id)?.pendientes ?? []}
                  avisos={revisiones.get(r.registration_id)?.avisos ?? []}
                />
                <div className="flex gap-2 mt-3 flex-wrap">
                  <NewPaymentDialog registrationId={r.registration_id} departureId={r.departure_id} pilgrimPaysInCop={r.paid_in_cop_originally} settlementTrm={r.settlement_trm} />
                  <EditRegistrationDialog
                    registration={{
                      registration_id: r.registration_id,
                      departure_id: r.departure_id,
                      total_eur: Number(r.total_eur ?? r.net_total_eur ?? 0),
                      discount_eur: Number(r.discount_eur ?? 0),
                      penalty_eur: Number(r.penalty_eur ?? 0),
                      penalty_note: r.penalty_note ?? null,
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
                  {r.settlement_trm && (
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/pdf/liquidacion/${r.registration_id}`} target="_blank">
                        <FileText className="h-4 w-4" /> Recibo final
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {(!registrations || registrations.length === 0) && (
            <Card className="md:col-span-2"><CardContent className="py-8 text-center text-muted-foreground text-sm">Aún no está inscrito en ningún camino. Andá a un camino y agregalo allí.</CardContent></Card>
          )}
        </div>
      </section>

      {settlementByReg.size > 0 && (
        <section>
          <h2 className="font-display text-xl text-noche mb-3">Liquidación final</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {(registrations ?? []).map((r: any) => {
              const s = settlementByReg.get(r.registration_id);
              return s ? <SettlementCard key={r.registration_id} settlement={s} /> : null;
            })}
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-display text-xl text-noche mb-3">Pagos</h2>
          <Card>
            <CardContent className="p-0">
              {pagos.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Sin pagos registrados.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Tasa del día</TableHead>
                      <TableHead className="text-right">EUR</TableHead>
                      {hayTasaDeCierre && <TableHead className="text-right">A tasa de cierre</TableHead>}
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagos.map((p) => {
                      const esDevolucion = p.kind === "devolucion";
                      const difPago = Number(p.fx_diff_eur ?? 0);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(p.paid_at)}
                            {p.kind !== "abono" && (
                              <Badge variant={esDevolucion ? "accent" : "success"} className="ml-1.5 align-middle text-[10px]">
                                {PAYMENT_KIND[p.kind].short}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className={`text-right whitespace-nowrap ${esDevolucion ? "text-info-800" : ""}`}>
                            {Number(p.amount).toLocaleString("es-CO")} {p.currency}
                          </TableCell>
                          <TableCell className="text-right">{p.trm_eur_cop ? Number(p.trm_eur_cop).toLocaleString("es-CO") : "—"}</TableCell>
                          <TableCell className="text-right">{formatEUR(p.amount_eur)}</TableCell>
                          {hayTasaDeCierre && (
                            <TableCell className="text-right whitespace-nowrap">
                              {p.se_revalora && p.settlement_trm ? (
                                <>
                                  {formatEUR(p.amount_eur_cierre)}
                                  {Math.abs(difPago) >= 0.01 && (
                                    <span className={`block text-[10px] ${difPago > 0 ? "text-ok-700" : "text-error-700"}`}>
                                      {difPago > 0 ? "+" : "−"}{formatEUR(Math.abs(difPago))}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground" title={motivoSinRecalculo(p.currency, p.method)}>
                                  igual
                                </span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-xs">{p.account ?? "—"}</TableCell>
                          <TableCell className="text-xs">{p.method ?? "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <EditPaymentDialog payment={p} />
                              <a href={`/api/pdf/recibo/${p.id}`} target="_blank" className="text-ocre-profundo hover:underline text-xs flex items-center gap-1 px-2">
                                <Download className="h-3 w-3" /> PDF
                              </a>
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
        </div>
        <PaymentSummary
          payments={pagos}
          totalEur={(registrations ?? []).reduce((s: number, r: any) => s + Number(r.net_total_eur || 0), 0)}
          penaltyEur={(registrations ?? []).reduce((s: number, r: any) => s + Number(r.penalty_eur || 0), 0)}
        />
      </section>
    </div>
  );
}
