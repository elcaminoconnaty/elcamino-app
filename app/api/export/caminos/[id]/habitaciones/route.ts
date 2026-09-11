import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { xlsxResponse } from "@/lib/export";
import { cargarRooming, filasDe, libroDeHotel, libroCompleto } from "@/lib/export/rooming";

export const dynamic = "force-dynamic";

/**
 * El Excel de habitaciones del camino. Con `?hotel=<providerId>` baja solo la pestaña
 * de ese hotel (lo mismo que se adjunta en el correo al hotel). El armado vive en
 * `lib/export/rooming.ts` porque lo comparte con el envío por correo.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const hotelFiltro = new URL(req.url).searchParams.get("hotel");

  const datos = await cargarRooming(supabase, params.id);
  if (!datos) return NextResponse.json({ error: "Camino no encontrado" }, { status: 404 });

  if (hotelFiltro) {
    const libro = libroDeHotel(datos, filasDe(datos, { hotelId: hotelFiltro }));
    if (!libro) return NextResponse.json({ error: "Ese hotel no tiene habitaciones en este camino" }, { status: 404 });
    return xlsxResponse(libro.wb, libro.filename);
  }

  const { wb, filename } = libroCompleto(datos);
  return xlsxResponse(wb, filename);
}
