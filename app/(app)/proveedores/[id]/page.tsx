import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatEUR, formatDate } from "@/lib/utils";
import { PROVIDER_TYPES } from "@/lib/constants";
import { NewProviderPaymentDialog } from "@/components/providers/new-provider-payment-dialog";
import { EditProviderForm } from "@/components/providers/edit-provider-form";
import { HotelPhotos } from "@/components/providers/hotel-photos";

export const dynamic = "force-dynamic";

export default async function ProviderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: provider } = await supabase.from("providers").select("*").eq("id", params.id).maybeSingle();
  if (!provider) notFound();

  const [{ data: reservations }, { data: payments }, { data: departures }] = await Promise.all([
    supabase.from("reservations").select("*, departures(name)").eq("provider_id", params.id).order("check_in", { ascending: true, nullsFirst: false }),
    supabase.from("provider_payments").select("*, departures(name), reservations(type, location)").eq("provider_id", params.id).order("paid_at", { ascending: true }),
    supabase.from("departures").select("id, name").order("start_date"),
  ]);

  // Las fotos solo tienen sentido para alojamientos: son las del documento de viaje.
  const { data: fotos } = provider.type === "alojamiento"
    ? await supabase.from("provider_photos")
        .select("id, storage_path, caption").eq("provider_id", params.id).order("position")
    : { data: [] as any[] };
  const fotosConUrl = (fotos ?? []).map((f: any) => ({
    ...f,
    url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/brand/${f.storage_path}`,
  }));

  const totalPaid = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount_eur || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/proveedores" className="text-sm text-muted-foreground hover:underline">← Proveedores</Link>
        <h1 className="font-display text-2xl sm:text-3xl text-noche mt-2 break-words">{provider.name}</h1>
        <div className="text-sm text-muted-foreground mt-1">
          {PROVIDER_TYPES.find((t) => t.value === provider.type)?.label} · {[provider.city, provider.country].filter(Boolean).join(", ")}
        </div>
        <div className="brand-yellow-bar mt-2" />
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {provider.type === "alojamiento" && (
            <Card>
              <CardHeader><CardTitle>Fotos del alojamiento</CardTitle></CardHeader>
              <CardContent>
                <HotelPhotos providerId={params.id} fotos={fotosConUrl} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Reservas</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(!reservations || reservations.length === 0) ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Sin reservas todavía.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Camino</TableHead>
                      <TableHead>Tipo / Lugar</TableHead>
                      <TableHead>Día</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservations.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.departures?.name ?? "—"}</TableCell>
                        <TableCell><div>{r.type}</div><div className="text-xs text-muted-foreground">{r.location}</div></TableCell>
                        <TableCell>{r.day_number ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatEUR(r.confirmed_cost_eur ?? r.estimated_cost_eur)}</TableCell>
                        <TableCell><Badge variant="muted">{r.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center flex-wrap gap-2">
                <CardTitle>Pagos a este proveedor</CardTitle>
                <NewProviderPaymentDialog providerId={provider.id} reservations={reservations ?? []} departures={departures ?? []} />
              </div>
              <div className="text-sm text-muted-foreground">Total pagado: <strong>{formatEUR(totalPaid)}</strong></div>
            </CardHeader>
            <CardContent className="p-0">
              {(!payments || payments.length === 0) ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Sin pagos.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Camino</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">EUR</TableHead>
                      <TableHead>Método</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatDate(p.paid_at)}</TableCell>
                        <TableCell className="text-sm">{p.departures?.name ?? "—"}</TableCell>
                        <TableCell className="text-right">{Number(p.amount).toLocaleString("es-CO")} {p.currency}</TableCell>
                        <TableCell className="text-right">{formatEUR(p.amount_eur)}</TableCell>
                        <TableCell className="text-sm">{p.method ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Datos</CardTitle></CardHeader>
          <CardContent>
            <EditProviderForm provider={provider} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
