import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { xlsxResponse } from "@/lib/export";
import { armarInformePagos } from "@/lib/pagos-pendientes/datos";
import { construirExcelPagos } from "@/lib/pagos-pendientes/excel";

export const dynamic = "force-dynamic";

/**
 * Todo lo que hay que pagarle a proveedores, de todos los caminos abiertos a la vez.
 * Con `?hasta=YYYY-MM-DD` sale solo lo que vence hasta esa fecha: es el Excel de
 * "lo que toca girar esta semana".
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const hasta = new URL(req.url).searchParams.get("hasta");
  const data = await armarInformePagos(supabase, { departureId: null, hasta });
  if (!data) return NextResponse.json({ error: "No se pudo armar el informe" }, { status: 500 });

  const sufijo = hasta ? `hasta-${hasta}` : new Date().toISOString().slice(0, 10);
  return xlsxResponse(construirExcelPagos(data), `pagos-proveedores-${sufijo}.xlsx`);
}
