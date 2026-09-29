import { NextResponse } from "next/server";
import { descargaPorToken } from "@/lib/videos/por-token";

/** "Guardar mi video": una URL firmada fresca que el navegador baja como archivo. */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const url = await descargaPorToken(params.token);
  if (!url) return new NextResponse("Enlace no válido", { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
