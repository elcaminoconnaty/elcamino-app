import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { LiquidacionFinalPDF } from "@/components/pdf/liquidacion-final";
import type { PilgrimSettlement, PaymentSettlement } from "@/lib/settlement";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { registrationId: string } }) {
  const supabase = createClient();

  const { data: settlement } = await supabase
    .from("v_pilgrim_settlement")
    .select("*")
    .eq("registration_id", params.registrationId)
    .maybeSingle();
  if (!settlement) return new Response("Not found", { status: 404 });

  const s = settlement as PilgrimSettlement;
  // Sin tasa de cierre no hay nada que liquidar todavía; el reporte de saldo
  // normal sigue sirviendo para ese caso.
  if (s.settlement_trm == null || Number(s.settlement_trm) <= 0) {
    return new Response(
      "Esta inscripción todavía no tiene tasa de cierre. Fijala en la pestaña Liquidación del camino.",
      { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const [{ data: reg }, { data: payments }] = await Promise.all([
    supabase
      .from("registrations")
      .select("pilgrims(full_name, email)")
      .eq("id", params.registrationId)
      .maybeSingle(),
    supabase
      .from("v_pilgrim_payment_settlement")
      .select("*")
      .eq("registration_id", params.registrationId)
      .order("paid_at", { ascending: true }),
  ]);

  const buffer = await renderToBuffer(
    LiquidacionFinalPDF({
      data: {
        registration_id: params.registrationId,
        pilgrim_name: (reg as any)?.pilgrims?.full_name ?? s.pilgrim_name,
        pilgrim_email: (reg as any)?.pilgrims?.email ?? null,
        departure_name: s.departure_name,
        departure_start_date: s.start_date,
        net_total_eur: Number(s.net_total_eur),
        settlement_trm: Number(s.settlement_trm),
        settlement_date: s.settlement_date,
        paid_eur_historico: Number(s.paid_eur_historico),
        paid_eur_cierre: Number(s.paid_eur_cierre),
        fx_difference_eur: Number(s.fx_difference_eur),
        cop_revalorado: Number(s.cop_revalorado),
        eur_fijo: Number(s.eur_fijo),
        saldo_final_eur: Number(s.saldo_final_eur),
        saldo_final_cop: s.saldo_final_cop != null ? Number(s.saldo_final_cop) : null,
        total_cop_cierre: s.total_cop_cierre != null ? Number(s.total_cop_cierre) : null,
        por_cobrar_eur: Number(s.por_cobrar_eur),
        por_cobrar_cop: s.por_cobrar_cop != null ? Number(s.por_cobrar_cop) : null,
        por_devolver_eur: Number(s.por_devolver_eur),
        por_devolver_cop: s.por_devolver_cop != null ? Number(s.por_devolver_cop) : null,
        devuelto_eur: Number(s.devuelto_eur),
        devuelto_cop: Number(s.devuelto_cop),
        estado_liquidacion: s.estado_liquidacion,
        payments: ((payments as PaymentSettlement[]) ?? []).map((p) => ({
          paid_at: p.paid_at,
          amount: Number(p.amount),
          currency: p.currency,
          trm_eur_cop: p.trm_eur_cop != null ? Number(p.trm_eur_cop) : null,
          amount_eur: p.amount_eur != null ? Number(p.amount_eur) : null,
          amount_eur_cierre: p.amount_eur_cierre != null ? Number(p.amount_eur_cierre) : null,
          se_revalora: !!p.se_revalora,
          method: p.method,
          kind: p.kind,
        })),
      },
    }) as any
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="liquidacion-${params.registrationId.slice(0, 8)}.pdf"`,
    },
  });
}
