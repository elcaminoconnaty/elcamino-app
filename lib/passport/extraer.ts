import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { PDF, tipoDeArchivoDePasaporte, porQueNoSirve } from "@/lib/passport/formatos";
import { armarNombreCompleto } from "@/lib/passport/nombres";

/**
 * Lee un pasaporte con Claude (visión) a partir de la foto que ya está en el bucket
 * `passports`. No escribe nada: quien llama decide qué hacer con los datos. Lo usan la
 * ficha del peregrino (equipo) y el formulario público de inscripción.
 */
export type PassportData = {
  /** Ya compuesto como lo guardamos: "Nombre Apellido". */
  full_name: string | null;
  given_names: string | null;
  surnames: string | null;
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
      given_names: { type: ["string", "null"], description: "SOLO los nombres de pila, del campo 'Nombres / Given names'" },
      surnames: { type: ["string", "null"], description: "SOLO los apellidos, del campo 'Apellidos / Surname'" },
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

/**
 * Baja el pasaporte del bucket y se lo pasa a Claude. Lanza si no hay clave, no se puede
 * leer o el formato no sirve.
 *
 * Un PDF no se manda como imagen: va en un bloque `document`, que es como la API acepta
 * los PDF (los rasteriza ella y además lee el texto embebido, que en un escaneo de
 * pasaporte suele traer la MRZ limpia).
 */
export async function extraerDatosPasaporte(supabase: any, storagePath: string): Promise<PassportData> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY en las variables.");
  const { data: file, error: dlErr } = await supabase.storage.from("passports").download(storagePath);
  if (dlErr || !file) throw new Error(`No pude leer el pasaporte: ${dlErr?.message}`);

  // El tipo que reporta el Storage manda; si viene vacío, lo deducimos de la extensión.
  const mimeType = file.type || (storagePath.toLowerCase().endsWith(".pdf") ? PDF : "image/jpeg");
  const clase = tipoDeArchivoDePasaporte(mimeType);
  if (!clase) throw new Error(porQueNoSirve(mimeType));

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const adjunto =
    clase === "pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: PDF as any, data: base64 } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: mimeType as any, data: base64 } };

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
          adjunto,
          { type: "text", text: "Extraé todos los datos posibles de este pasaporte. Los apellidos y los nombres van en campos SEPARADOS: copiá cada uno del rótulo que le corresponde ('Apellidos / Surname' y 'Nombres / Given names') y no los juntes ni los inviertas. Si hay MRZ legible (las 2 líneas inferiores con < <), usala para validar. Si el archivo trae varias páginas, buscá la de la foto y los datos. Si un dato no es claro devolvé null y bajá confidence." },
        ],
      },
    ],
  });
  const toolUse = message.content.find((c: any) => c.type === "tool_use") as any;
  if (!toolUse) throw new Error("Claude no devolvió datos");
  const leido = toolUse.input as PassportData;

  // El nombre no se guarda como vino: se compone acá, siempre nombre antes que apellido.
  return { ...leido, full_name: armarNombreCompleto(leido) || null };
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
