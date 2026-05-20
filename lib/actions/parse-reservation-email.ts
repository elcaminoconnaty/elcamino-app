"use server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export type ParsedReservation = {
  provider_id: string | null;
  provider_name_suggested: string | null;
  provider_email_suggested: string | null;
  type: string;
  location: string | null;
  day_number: number | null;
  check_in: string | null;
  check_out: string | null;
  beds_count: number | null;
  accommodation_type: string | null;
  confirmed_cost_eur: number | null;
  estimated_cost_eur: number | null;
  status: string;
  confirmation_ref: string | null;
  notes: string;
  confidence: "high" | "medium" | "low";
};

const RESERVATION_TOOL = {
  name: "registrar_reserva",
  description: "Registrar una reserva extraída del correo del proveedor",
  input_schema: {
    type: "object" as const,
    properties: {
      provider_id: { type: ["string", "null"], description: "UUID del proveedor si hace match exacto contra la lista provista, null si no" },
      provider_name_suggested: { type: ["string", "null"], description: "Nombre del proveedor según el correo (para crear uno nuevo si provider_id es null)" },
      provider_email_suggested: { type: ["string", "null"], description: "Email del proveedor según el correo" },
      type: { type: "string", enum: ["alojamiento", "transporte", "cenas", "equipaje", "seguro", "guia", "agencia", "otro"], description: "Tipo de servicio" },
      location: { type: ["string", "null"], description: "Ciudad o lugar (ej. Sarria, Portomarín)" },
      day_number: { type: ["integer", "null"], description: "Día del camino al que corresponde (1-N), si se infiere; null si no" },
      check_in: { type: ["string", "null"], description: "Fecha check-in en formato YYYY-MM-DD" },
      check_out: { type: ["string", "null"], description: "Fecha check-out en formato YYYY-MM-DD" },
      beds_count: { type: ["integer", "null"], description: "Cantidad de camas o plazas reservadas" },
      accommodation_type: { type: ["string", "null"], description: "Tipo de acomodación (dorm, compartido, privado, etc.)" },
      confirmed_cost_eur: { type: ["number", "null"], description: "Costo total confirmado en EUR si está en el correo" },
      estimated_cost_eur: { type: ["number", "null"], description: "Costo estimado en EUR si no hay confirmado" },
      status: { type: "string", enum: ["presupuestado", "contactado", "reservado", "confirmado", "pagado"], description: "Estado de la reserva según el correo" },
      confirmation_ref: { type: ["string", "null"], description: "Número o código de reserva/confirmación si aparece" },
      notes: { type: "string", description: "Notas relevantes extraídas del correo (condiciones de cancelación, dirección, horarios, etc.)" },
      confidence: { type: "string", enum: ["high", "medium", "low"], description: "Qué tan claro fue extraer los datos del correo" },
    },
    required: ["type", "status", "notes", "confidence"],
  },
};

export async function parseReservationEmail(emailText: string, departureId: string): Promise<ParsedReservation> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta ANTHROPIC_API_KEY en el entorno. Agregala a .env.local y reiniciá.");
  }

  const supabase = createClient();
  const [{ data: providers }, { data: departure }] = await Promise.all([
    supabase.from("providers").select("id, name, email, type, city").eq("active", true),
    supabase.from("departures").select("name, start_date, end_date").eq("id", departureId).maybeSingle(),
  ]);

  const providersList = (providers ?? [])
    .map((p: any) => `- ${p.name} (id: ${p.id}, email: ${p.email ?? "—"}, tipo: ${p.type}, ciudad: ${p.city ?? "—"})`)
    .join("\n");

  const departureContext = departure
    ? `Camino: ${(departure as any).name}\nFechas del viaje: ${(departure as any).start_date} a ${(departure as any).end_date}`
    : "";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    tools: [RESERVATION_TOOL],
    tool_choice: { type: "tool", name: "registrar_reserva" },
    messages: [
      {
        role: "user",
        content: `Extraé los datos de la siguiente reserva enviada por un proveedor del Camino de Santiago.

${departureContext}

PROVEEDORES YA REGISTRADOS (intentá match por email del remitente o por nombre; si encontrás coincidencia clara devolvé su id en provider_id):
${providersList || "(ninguno cargado todavía)"}

CORREO RECIBIDO:
"""
${emailText}
"""

Reglas:
- Si el correo es de un proveedor que YA está en la lista, devolvé provider_id (UUID) y dejá provider_name_suggested en null.
- Si NO está en la lista, dejá provider_id en null y rellená provider_name_suggested + provider_email_suggested para que el usuario lo cree.
- Si el correo confirma cantidad y precio, status = "confirmado" y poné confirmed_cost_eur.
- Si solo apartó sin confirmar precio final, status = "reservado" o "contactado" según corresponda y usá estimated_cost_eur.
- day_number se infiere si el correo menciona "día X" o si la fecha de check-in coincide con un día del camino.
- En notes resumí condiciones de pago, cancelación, horarios o cualquier detalle útil. Mantenelo breve.
- Si algo no se puede inferir con certeza, devolvé null y bajá confidence.`,
      },
    ],
  });

  const toolUse = message.content.find((c: any) => c.type === "tool_use") as any;
  if (!toolUse) {
    throw new Error("Claude no devolvió datos estructurados");
  }
  return toolUse.input as ParsedReservation;
}
