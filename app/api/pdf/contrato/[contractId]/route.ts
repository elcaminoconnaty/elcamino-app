import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sirve el PDF del contrato al equipo. Va detrás del middleware, así que exige sesión.
 * El peregrino usa `/api/pdf/contrato/publico/[token]`, que se autentica con el enlace.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { contractId: string } }) {
  const supabase = createClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("pdf_signed_path, pdf_original_path, status, access_token")
    .eq("id", params.contractId)
    .maybeSingle();

  if (!c) return new NextResponse("No encontré ese contrato.", { status: 404 });

  const ruta = c.pdf_signed_path ?? c.pdf_original_path;
  if (!ruta) return new NextResponse("Este contrato todavía no tiene PDF generado.", { status: 409 });

  const { data: archivo, error } = await supabase.storage.from("contracts").download(ruta);
  if (error || !archivo) return new NextResponse(`No pude leer el archivo: ${error?.message}`, { status: 500 });

  const codigo = String(c.access_token).slice(0, 8).toUpperCase();
  const sufijo = c.pdf_signed_path ? "-firmado" : "";
  return new NextResponse(await archivo.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Contrato-${codigo}${sufijo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
