import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReciboPagoPDF } from "@/components/pdf/recibo-pago";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { paymentId: string } }) {
  const supabase = createClient();
  const { data: pay } = await supabase
    .from("pilgrim_payments")
    .select("*")
    .eq("id", params.paymentId)
    .maybeSingle();
  if (!pay) return new Response("Not found", { status: 404 });

  const { data: reg } = await supabase
    .from("registrations")
    .select("*, departures(name, start_date), pilgrims(full_name, email)")
    .eq("id", pay.registration_id)
    .maybeSingle();

  const { data: balance } = await supabase
    .from("v_pilgrim_balance")
    .select("paid_eur, pending_eur, net_total_eur, frozen_trm_eur_cop, frozen_trm_date, paid_in_cop_originally")
    .eq("registration_id", pay.registration_id)
    .maybeSingle();

  const buffer = await renderToBuffer(
    ReciboPagoPDF({
      data: {
        payment_id: pay.id,
        paid_at: pay.paid_at,
        amount: Number(pay.amount),
        currency: pay.currency,
        trm_eur_cop: pay.trm_eur_cop != null ? Number(pay.trm_eur_cop) : null,
        amount_eur: pay.amount_eur != null ? Number(pay.amount_eur) : null,
        method: pay.method,
        reference: pay.reference,
        notes: pay.notes,
        pilgrim_name: (reg as any)?.pilgrims?.full_name ?? "—",
        pilgrim_email: (reg as any)?.pilgrims?.email ?? null,
        departure_name: (reg as any)?.departures?.name ?? "—",
        departure_start_date: (reg as any)?.departures?.start_date ?? null,
        total_eur: Number(balance?.net_total_eur ?? 0),
        paid_total_eur: Number(balance?.paid_eur ?? 0),
        pending_eur: Number(balance?.pending_eur ?? 0),
        frozen_trm_eur_cop: balance?.frozen_trm_eur_cop != null ? Number(balance.frozen_trm_eur_cop) : null,
        frozen_trm_date: balance?.frozen_trm_date ?? null,
        paid_in_cop_originally: !!balance?.paid_in_cop_originally,
      },
    }) as any
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recibo-${params.paymentId.slice(0, 8)}.pdf"`,
    },
  });
}
