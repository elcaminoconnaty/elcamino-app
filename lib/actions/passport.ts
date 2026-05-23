"use server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

/**
 * Genera una URL firmada para que el cliente suba directo al Storage de Supabase.
 * No hay límite de payload del server action porque el archivo va directo al bucket.
 */
export async function getPassportUploadUrl(pilgrimId: string, filename: string) {
  const supabase = createClient();
  const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${pilgrimId}/${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage
    .from("passports")
    .createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/**
 * Después de subir, llama a Claude Vision con el path para extraer datos.
 */
export async function extractPassportFromStorage(pilgrimId: string, storagePath: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta ANTHROPIC_API_KEY en .env.local");
  }

  const supabase = createClient();

  // Bajamos el archivo del storage al server (server action, no pasa por el cliente)
  const { data: file, error: dlErr } = await supabase.storage.from("passports").download(storagePath);
  if (dlErr || !file) throw new Error(`No pude leer el pasaporte: ${dlErr?.message}`);

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
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
  const data = toolUse.input as PassportData;

  const updates: any = { passport_image_path: storagePath, passport_extracted_at: new Date().toISOString() };
  if (data.full_name) updates.full_name = data.full_name;
  if (data.passport_number) updates.passport_number = data.passport_number;
  if (data.nationality) updates.nationality = data.nationality;
  if (data.sex) updates.sex = data.sex;
  if (data.birth_date) updates.birth_date = data.birth_date;
  if (data.passport_issue_date) updates.passport_issue_date = data.passport_issue_date;
  if (data.passport_expiry_date) updates.passport_expiry_date = data.passport_expiry_date;
  if (data.mrz) updates.passport_mrz = data.mrz;
  if (data.country) updates.country = data.country;

  const { error: updErr } = await supabase.from("pilgrims").update(updates).eq("id", pilgrimId);
  if (updErr) throw new Error(updErr.message);

  revalidatePath(`/peregrinos/${pilgrimId}`);
  return { data, path: storagePath };
}

export async function getPassportImageUrl(pilgrimId: string): Promise<string | null> {
  const supabase = createClient();
  const { data: p } = await supabase.from("pilgrims").select("passport_image_path").eq("id", pilgrimId).maybeSingle();
  if (!p?.passport_image_path) return null;
  const { data } = await supabase.storage.from("passports").createSignedUrl(p.passport_image_path, 600);
  return data?.signedUrl ?? null;
}

/**
 * Borra todas las fotos de pasaporte de los peregrinos inscritos en una salida.
 * Pensado para usarse cuando el viaje termina (departure.status = 'finished').
 */
export async function deletePassportsForDeparture(departureId: string) {
  const supabase = createClient();
  const { data: regs } = await supabase
    .from("registrations")
    .select("pilgrim_id, pilgrims!inner(passport_image_path)")
    .eq("departure_id", departureId);

  const paths: string[] = [];
  const pilgrimIds: string[] = [];
  for (const r of (regs ?? []) as any[]) {
    if (r.pilgrims?.passport_image_path) {
      paths.push(r.pilgrims.passport_image_path);
      pilgrimIds.push(r.pilgrim_id);
    }
  }

  if (paths.length === 0) return { deleted: 0 };

  const { error: rmErr } = await supabase.storage.from("passports").remove(paths);
  if (rmErr) throw new Error(rmErr.message);

  await supabase
    .from("pilgrims")
    .update({
      passport_image_path: null,
      passport_extracted_at: null,
    })
    .in("id", pilgrimIds);

  revalidatePath("/peregrinos");
  return { deleted: paths.length };
}
