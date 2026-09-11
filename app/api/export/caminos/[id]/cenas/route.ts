import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { xlsxResponse } from "@/lib/export";
import { cargarCenas, cenasDe, libroDeRestaurante, libroCompletoCenas } from "@/lib/export/cenas";

export const dynamic = "force-dynamic";

/**
 * El Excel de cenas del camino. Con `?restaurante=<providerId>` baja solo la pestaña de
 * ese restaurante (lo mismo que se adjunta en el correo). El armado vive en
 * `lib/export/cenas.ts` porque lo comparte con el envío por correo.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const restauranteFiltro = new URL(req.url).searchParams.get("restaurante");

  const datos = await cargarCenas(supabase, params.id);
  if (!datos) return NextResponse.json({ error: "Camino no encontrado" }, { status: 404 });

  if (restauranteFiltro) {
    const libro = libroDeRestaurante(datos, cenasDe(datos, { providerId: restauranteFiltro }));
    if (!libro) return NextResponse.json({ error: "Ese restaurante no tiene cenas en este camino" }, { status: 404 });
    return xlsxResponse(libro.wb, libro.filename);
  }

  const { wb, filename } = libroCompletoCenas(datos);
  return xlsxResponse(wb, filename);
}
