import { respuestaCarta } from "@/lib/bienvenida/pdf";

/** La carta del camino sin nombre ("Querido peregrino, querida peregrina"), para revisarla o mandarla al grupo. */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { departureId: string } }) {
  const descargar = new URL(req.url).searchParams.has("descargar");
  return respuestaCarta(params.departureId, { descargar });
}
