import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { DocumentoViajePDF } from "@/components/pdf/documento-viaje";
import { documentoPorToken } from "@/lib/travel-doc/por-token";

/**
 * El PDF del documento de viaje, para quien lo quiera llevar sin señal.
 * Ruta pública: se autentica con el token del enlace, igual que la página.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const doc = await documentoPorToken(params.token);
  if (!doc) return new NextResponse("Enlace no válido.", { status: 404 });

  const pdf = await renderToBuffer(DocumentoViajePDF({ doc }) as any);
  const nombre = `Documento-de-viaje-${doc.etiqueta.replace(".", "-")}.pdf`;
  // `Buffer` no encaja en `BodyInit`; el resto de rutas de PDF hacen lo mismo.
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
