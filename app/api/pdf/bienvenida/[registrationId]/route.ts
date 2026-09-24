import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respuestaCarta } from "@/lib/bienvenida/pdf";

/** La carta de bienvenida con el nombre del peregrino. Se baja desde su tarjeta. */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { registrationId: string } }) {
  const supabase = createClient();
  const { data: reg } = await supabase.from("registrations").select("id, departure_id").eq("id", params.registrationId).maybeSingle();
  if (!reg) return new NextResponse("No encontré esa inscripción.", { status: 404 });
  const descargar = new URL(req.url).searchParams.has("descargar");
  return respuestaCarta(reg.departure_id, { registrationId: reg.id, descargar });
}
