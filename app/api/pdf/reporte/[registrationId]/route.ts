import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReporteSaldoPDF } from "@/components/pdf/reporte-saldo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { registrationId: string } }) {
  const supabase = createClient();
  const { data: balance } = await supabase
    .from("v_pilgrim_balance")
    .select("*")
    .eq("registration_id", params.registrationId)
    .maybeSingle();
  if (!balance) return new Response("Not found", { status: 404 });

  const { data: reg } = await supabase
    .from("registrations")
    .select("*, departures(name, start_date), pilgrims(full_name, email)")
    .eq("id", params.registrationId)
    .maybeSingle();

  const { data: payments } = await supabase
    .from("v_pilgrim_payment_settlement")
    .select("paid_at, amount, currency, trm_eur_cop, amount_eur, amount_eur_cierre, se_revalora, method, kind")
    .eq("registration_id", params.registrationId)
    .order("paid_at", { ascending: true });

  const { data: latestTrm } = await supabase
    .from("trm_rates")
    .select("eur_cop")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const buffer = await renderToBuffer(
    ReporteSaldoPDF({
      data: {
        registration_id: params.registrationId,
        pilgrim_name: (reg as any)?.pilgrims?.full_name ?? "—",
        pilgrim_email: (reg as any)?.pilgrims?.email ?? null,
        departure_name: (reg as any)?.departures?.name ?? "—",
        departure_start_date: (reg as any)?.departures?.start_date ?? null,
        total_eur: Number(balance.net_total_eur ?? 0),
        penalty_eur: Number(balance.penalty_eur ?? 0),
        penalty_note: balance.penalty_note ?? null,
        paid_eur: Number(balance.paid_eur ?? 0),
        pending_eur: Number(balance.pending_eur ?? 0),
        pending_cop_reference: balance.pending_cop_reference != null ? Number(balance.pending_cop_reference) : null,
        settlement_trm: balance.settlement_trm != null ? Number(balance.settlement_trm) : null,
        settlement_date: balance.settlement_date,
        settlement_mode: balance.settlement_mode ?? "recalculo",
        paid_eur_cierre: Number(balance.paid_eur_cierre ?? 0),
        saldo_final_eur: balance.saldo_final_eur != null ? Number(balance.saldo_final_eur) : null,
        saldo_final_cop: balance.saldo_final_cop != null ? Number(balance.saldo_final_cop) : null,
        paid_in_cop_originally: !!balance.paid_in_cop_originally,
        current_trm: latestTrm?.eur_cop != null ? Number(latestTrm.eur_cop) : null,
        payments: (payments ?? []).map((p: any) => ({
          paid_at: p.paid_at,
          amount: Number(p.amount),
          currency: p.currency,
          trm_eur_cop: p.trm_eur_cop != null ? Number(p.trm_eur_cop) : null,
          amount_eur: p.amount_eur != null ? Number(p.amount_eur) : null,
          amount_eur_cierre: p.amount_eur_cierre != null ? Number(p.amount_eur_cierre) : null,
          se_revalora: !!p.se_revalora,
          method: p.method,
          kind: p.kind ?? "abono",
        })),
      },
    }) as any
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reporte-${params.registrationId.slice(0, 8)}.pdf"`,
    },
  });
}
