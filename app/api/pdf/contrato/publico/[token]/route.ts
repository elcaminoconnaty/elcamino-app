import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenPlausible } from "@/lib/contracts/firma";

/**
 * El PDF que ve el peregrino desde su enlace de firma.
 *
 * Ruta pública, autenticada por el token de 256 bits. Se rechazan los tokens con forma
 * inválida antes de tocar la base, para no dar pistas por el tiempo de respuesta. Nunca se
 * expone una URL de Storage: el archivo se sirve desde acá, con `no-store`.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!tokenPlausible(params.token)) return new NextResponse("Enlace no válido.", { status: 404 });

  const supabase = createAdminClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("pdf_signed_path, pdf_original_path, status, token_expires_at")
    .eq("access_token", params.token)
    .maybeSingle();

  if (!c || c.status === "anulado") return new NextResponse("Enlace no válido.", { status: 404 });
  if (c.status !== "firmado" && c.token_expires_at && new Date(c.token_expires_at) < new Date()) {
    return new NextResponse("El enlace venció.", { status: 410 });
  }

  const ruta = c.pdf_signed_path ?? c.pdf_original_path;
  if (!ruta) return new NextResponse("El contrato todavía no está listo.", { status: 409 });

  const { data: archivo, error } = await supabase.storage.from("contracts").download(ruta);
  if (error || !archivo) return new NextResponse("No pude leer el archivo.", { status: 500 });

  return new NextResponse(await archivo.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Contrato-El-Camino-con-Naty.pdf"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
