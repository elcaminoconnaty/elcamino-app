import { NextResponse } from "next/server";
import { registrarVista } from "@/lib/videos/por-token";

/** El reproductor avisa aquí la primera vez que le dan play. */
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { token: string } }) {
  await registrarVista(params.token);
  return new NextResponse(null, { status: 204 });
}
