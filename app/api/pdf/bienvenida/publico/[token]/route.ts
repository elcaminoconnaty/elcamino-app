import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenPlausible } from "@/lib/menus/por-token";
import { respuestaCarta } from "@/lib/bienvenida/pdf";

/**
 * La carta del peregrino, por su enlace personal (el mismo token del formulario de registro).
 * Ruta pública: está en el middleware y en `next.config.mjs` como las demás por token.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!tokenPlausible(params.token)) return new NextResponse("Enlace no válido.", { status: 404 });
  const { data: reg } = await createAdminClient()
    .from("registrations")
    .select("id, departure_id, status, pilgrims:pilgrim_id(deleted_at)")
    .eq("form_token", params.token)
    .maybeSingle();
  if (!reg || reg.status === "cancelado" || (reg as any).pilgrims?.deleted_at) return new NextResponse("Enlace no válido.", { status: 404 });
  return respuestaCarta(reg.departure_id, { registrationId: reg.id, publico: true });
}
