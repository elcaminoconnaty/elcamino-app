import "server-only";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { CartaBienvenidaPDF } from "@/components/pdf/carta-bienvenida";
import { armarCarta, nombreDeArchivo } from "@/lib/bienvenida/datos";

/** Arma la carta y la devuelve como PDF. `descargar` la baja en vez de abrirla en el navegador. */
export async function respuestaCarta(
  departureId: string,
  opciones: { registrationId?: string | null; publico?: boolean; descargar?: boolean }
): Promise<NextResponse> {
  let carta;
  try {
    carta = await armarCarta(departureId, opciones);
  } catch (e: any) {
    return new NextResponse(e?.message ?? "No se pudo armar la carta.", { status: 404 });
  }
  const pdf = await renderToBuffer(CartaBienvenidaPDF({ carta }) as any);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${opciones.descargar ? "attachment" : "inline"}; filename="${nombreDeArchivo(carta)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
