/**
 * Revisa la vista previa del envío masivo de contratos contra los datos reales.
 *
 * NO envía ningún correo: solo consulta quién recibiría uno y por qué, replicando
 * las mismas reglas que `previsualizarEnvioMasivo`. Sirve para ver, antes de que
 * Naty le dé al botón, si la lista que le vamos a mostrar tiene sentido.
 *
 *   node --env-file=.env.local scripts/probar-contratos-masivo.mjs
 */
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: caminos } = await db.from("departures").select("id, name").order("start_date");
let fallos = 0;
const check = (ok, m) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };

for (const d of caminos) {
  const { data: regs } = await db
    .from("registrations")
    .select("id, status, pilgrim_id, pilgrims:pilgrim_id ( full_name, email, is_team, deleted_at )")
    .eq("departure_id", d.id);
  const inscripciones = (regs ?? [])
    .filter((r) => r.pilgrims && !r.pilgrims.is_team && !r.pilgrims.deleted_at && r.status !== "cancelado");
  if (inscripciones.length === 0) continue;

  const { data: contratos } = await db.from("contracts")
    .select("id, registration_id, status, version")
    .in("registration_id", inscripciones.map((r) => r.id))
    .in("status", ["borrador", "enviado", "visto", "firmado"]);
  const porReg = new Map((contratos ?? []).map((c) => [c.registration_id, c]));

  const sinCorreo = inscripciones.filter((r) => !r.pilgrims.email);
  const firmados = inscripciones.filter((r) => porReg.get(r.id)?.status === "firmado");
  const conBorrador = inscripciones.filter((r) => porReg.get(r.id) && porReg.get(r.id).status !== "firmado");

  console.log(`\n${d.name}`);
  console.log(`  ${inscripciones.length} peregrinos · ${firmados.length} firmados · ${conBorrador.length} con contrato vivo · ${sinCorreo.length} sin correo`);
  check(inscripciones.every((r) => r.pilgrims.full_name), "todos tienen nombre");
  if (sinCorreo.length) console.log(`  sin correo: ${sinCorreo.map((r) => r.pilgrims.full_name).join(", ")}`);

  // Un contrato vivo por inscripción como máximo: si hubiera dos, la previa elegiría uno al azar
  const dobles = [...new Map(Object.entries(
    (contratos ?? []).reduce((acc, c) => { acc[c.registration_id] = (acc[c.registration_id] ?? 0) + 1; return acc; }, {})
  )).entries()].filter(([, n]) => n > 1);
  check(dobles.length === 0, `ninguna inscripción tiene dos contratos vivos${dobles.length ? ` — ${JSON.stringify(dobles)}` : ""}`);

  // Correos con formato válido: uno malo tumba solo su envío, pero conviene verlo antes
  const malos = inscripciones.filter((r) => r.pilgrims.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.pilgrims.email));
  check(malos.length === 0, `todos los correos tienen forma de correo${malos.length ? ` — ${malos.map((r) => r.pilgrims.email).join(", ")}` : ""}`);
}

console.log("\n=== Configuración de correo ===");
for (const k of ["BREVO_API_KEY", "BREVO_SENDER_EMAIL"]) {
  console.log(`  ${process.env[k] ? "✓" : "✗"} ${k}${process.env[k] ? "" : " — falta (en este .env.local; hay que confirmarla en Railway)"}`);
}

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
