import { NextResponse } from "next/server";
import { registroDelCamino } from "@/lib/registro/datos-equipo";
import { construirExcelRegistro } from "@/lib/registro/excel";
import { respuestaExcel } from "@/lib/export/bonito";
import { fileSlug } from "@/lib/export";

/** El Excel del registro del camino (ver `lib/registro/excel.ts`). */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await registroDelCamino(params.id);
  if (!r) return NextResponse.json({ error: "Camino no encontrado" }, { status: 404 });
  return respuestaExcel(await construirExcelRegistro(r), `registro-${fileSlug(r.camino)}.xlsx`);
}
