import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fileSlug } from "@/lib/export";
import { respuestaExcel } from "@/lib/export/bonito";
import { armarInformePagos } from "@/lib/pagos-pendientes/datos";
import { construirExcelPagos } from "@/lib/pagos-pendientes/excel";

export const dynamic = "force-dynamic";

/** Los pagos pendientes de un camino, en Excel y partidos por medio de pago. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const hasta = new URL(req.url).searchParams.get("hasta");
  const data = await armarInformePagos(supabase, { departureId: params.id, hasta });
  if (!data) return NextResponse.json({ error: "Camino no encontrado" }, { status: 404 });

  return respuestaExcel(
    await construirExcelPagos(data),
    `pagos-proveedores-${fileSlug(data.titulo)}-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
