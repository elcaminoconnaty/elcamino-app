/**
 * Publica el documento de viaje de un camino y devuelve su token.
 *   node --env-file=.env.local scripts/publicar-documento.mjs <departure_id>
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const id = process.argv[2];
if (!id) { console.error("Falta el id del camino."); process.exit(1); }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await db.from("departures").select("travel_doc_token, travel_doc").eq("id", id).single();

let token = data?.travel_doc_token;
if (!token) {
  token = crypto.randomBytes(24).toString("hex");
  await db.from("departures").update({
    travel_doc_token: token,
    travel_doc: data?.travel_doc ?? {
      tagline: "El verdadero territorio que caminas eres tú",
      banda: "Itinerario y reservas",
    },
  }).eq("id", id);
}
console.log(token);
