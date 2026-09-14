import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { armarInformePagos } from "@/lib/pagos-pendientes/datos";
import { InformePagosPDF } from "@/components/pdf/informe-pagos-pendientes";

export const dynamic = "force-dynamic";

/** Los pagos a proveedores de todos los caminos, en PDF. Con `?hasta=` recorta por fecha. */
export async function GET(req: Request) {
  const supabase = createClient();
  const hasta = new URL(req.url).searchParams.get("hasta");
  const data = await armarInformePagos(supabase, { departureId: null, hasta });
  if (!data) return new Response("Not found", { status: 404 });
  const buffer = await renderToBuffer(InformePagosPDF({ data }) as any);
  const sufijo = hasta ? `hasta-${hasta}` : new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pagos-proveedores-${sufijo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
