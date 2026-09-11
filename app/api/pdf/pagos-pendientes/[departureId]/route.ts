import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { armarInformePagos } from "@/lib/pagos-pendientes/datos";
import { InformePagosPDF } from "@/components/pdf/informe-pagos-pendientes";
import { fileSlug } from "@/lib/export";

export const dynamic = "force-dynamic";

/** El informe de pagos pendientes a proveedores, en PDF, para que Naty haga los pagos. */
export async function GET(_req: Request, { params }: { params: { departureId: string } }) {
  const supabase = createClient();
  const data = await armarInformePagos(supabase, params.departureId);
  if (!data) return new Response("Not found", { status: 404 });
  const buffer = await renderToBuffer(InformePagosPDF({ data }) as any);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pagos-pendientes-${fileSlug(data.camino)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
