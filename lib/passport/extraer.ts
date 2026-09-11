import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Lee un pasaporte con Claude (visión) a partir de la foto que ya está en el bucket
 * `passports`. No escribe nada: quien llama decide qué hacer con los datos. Lo usan la
 * ficha del peregrino (equipo) y el formulario público de inscripción.
 */
export type PassportData = {
  full_name: string | null;
  passport_number: string | null;
  nationality: string | null;
  sex: string | null;
  birth_date: string | null;
  passport_issue_date: string | null;
  passport_expiry_date: string | null;
  mrz: string | null;
  country: string | null;
  confidence: "high" | "medium" | "low";
};

const PASSPORT_TOOL = {
  name: "extraer_pasaporte",
  description: "Extraer los datos del pasaporte de la imagen",
  input_schema: {
    type: "object" as const,
    properties: {
      full_name: { type: ["string", "null"] },
      passport_number: { type: ["string", "null"] },
      nationality: { type: ["string", "null"] },
      sex: { type: ["string", "null"], enum: ["M", "F", null] },
      birth_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      passport_issue_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      passport_expiry_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      mrz: { type: ["string", "null"] },
      country: { type: ["string", "null"] },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["confidence"],
  },
};

export function ocrDisponible(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Baja la foto del bucket y se la pasa a Claude. Lanza si no hay clave o no se puede leer. */
export async function extraerDatosPasaporte(supabase: any, storagePath: string): Promise<PassportData> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY en las variables.");
  const { data: file, error: dlErr } = await supabase.storage.from("passports").download(storagePath);
  if (dlErr || !file) throw new Error(`No pude leer el pasaporte: ${dlErr?.message}`);
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mimeType = file.type || "image/jpeg";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    tools: [PASSPORT_TOOL],
    tool_choice: { type: "tool", name: "extraer_pasaporte" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType as any, data: base64 } },
          { type: "text", text: "Extraé todos los datos posibles de este pasaporte. Si hay MRZ legible (las 2 líneas inferiores con < <), usala para validar. Si un dato no es claro devolvé null y bajá confidence." },
        ],
      },
    ],
  });
  const toolUse = message.content.find((c: any) => c.type === "tool_use") as any;
  if (!toolUse) throw new Error("Claude no devolvió datos");
  return toolUse.input as PassportData;
}

/** Los campos de `pilgrims` que salen de una lectura (solo los que vinieron con dato). */
export function camposDesdePasaporte(data: PassportData, storagePath: string): Record<string, unknown> {
  const updates: Record<string, unknown> = { passport_image_path: storagePath, passport_extracted_at: new Date().toISOString() };
  if (data.full_name) updates.full_name = data.full_name;
  if (data.passport_number) updates.passport_number = data.passport_number;
  if (data.nationality) updates.nationality = data.nationality;
  if (data.sex) updates.sex = data.sex;
  if (data.birth_date) updates.birth_date = data.birth_date;
  if (data.passport_issue_date) updates.passport_issue_date = data.passport_issue_date;
  if (data.passport_expiry_date) updates.passport_expiry_date = data.passport_expiry_date;
  if (data.mrz) updates.passport_mrz = data.mrz;
  if (data.country) updates.country = data.country;
  return updates;
}
