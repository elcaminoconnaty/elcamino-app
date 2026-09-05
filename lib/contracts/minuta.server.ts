import "server-only";
import { createClient } from "@/lib/supabase/server";
import { MINUTA_DE_FABRICA, type Minuta } from "./minuta";

/**
 * Devuelve la minuta vigente: la de `app_settings` si existe, si no la de fábrica.
 * Nunca lanza — si la base no responde, el contrato se genera con el texto del repo, que
 * es el mismo con el que se firmaron los dos contratos reales.
 */
export async function minutaVigente(): Promise<Minuta> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "contract_template")
      .maybeSingle();
    const v = data?.value as Minuta | undefined;
    if (v?.secciones?.length) return v;
  } catch {
    // Silencio a propósito: la de fábrica es una respuesta correcta, no un plan B roto.
  }
  return MINUTA_DE_FABRICA;
}
