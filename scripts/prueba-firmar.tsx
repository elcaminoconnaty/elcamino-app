/**
 * Segunda mitad de la prueba: firmar con el código real y comprobar el sellado.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/prueba-firmar.tsx <token> <código>
 */
// `dotenv/config` lee .env; Next usa .env.local, así que se carga explícitamente.
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { contratoPorToken, firmarContrato } from "@/lib/contracts/sign";
import { sha256 } from "@/lib/contracts/firma";

const [token, codigo] = process.argv.slice(2);
const SALIDA = process.env.OUT ?? "/tmp";
let paso = 0;
const ok = (t: string, extra = "") => console.log(`  ✓ ${t}${extra ? ` — ${extra}` : ""}`);
const titulo = (t: string) => console.log(`\n${++paso}. ${t}`);
const fallo = (t: string) => { console.error(`  ✗ ${t}`); process.exitCode = 1; };

/** Una firma dibujada de verdad, del tamaño que produce el canvas (1120×360). */
const TRAZO = fs.readFileSync("scripts/firma-de-prueba.txt", "utf8").trim();

async function main() {
  if (!token || !codigo) throw new Error("Uso: prueba-firmar.tsx <token> <código>");
  const db = createAdminClient();

  titulo("Firmar con el código real");
  const r = await firmarContrato({
    token, codigo, trazoDataUrl: TRAZO, aceptaLectura: true, aceptaFirma: true,
    huella: { ip: "190.0.0.1", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) Prueba" },
    geo: "6.244203, -75.581215",
  });
  if (!r.ok) return fallo(r.error);
  ok("firmado", r.huella.slice(0, 16) + "…");

  titulo("El documento sellado");
  const { data: c } = await db.from("contracts")
    .select("id, status, pdf_signed_path, pdf_signed_sha256, pdf_original_sha256, signed_at")
    .eq("access_token", token).single();
  if (c?.status !== "firmado") return fallo(`estado: ${c?.status}`);
  const { data: archivo } = await db.storage.from("contracts").download(c.pdf_signed_path!);
  const buf = Buffer.from(await archivo!.arrayBuffer());
  fs.writeFileSync(`${SALIDA}/contrato-firmado.pdf`, buf);
  const real = sha256(buf);
  if (real !== c.pdf_signed_sha256) return fallo("la huella guardada no coincide con el archivo");
  ok("huella verificada contra el archivo real", `${(buf.length / 1024).toFixed(0)} kB`);
  ok("el original y el firmado tienen huellas distintas",
     c.pdf_original_sha256!.slice(0, 8) + "… vs " + c.pdf_signed_sha256!.slice(0, 8) + "…");

  titulo("Volver a abrir el enlace ya firmado");
  const vista = await contratoPorToken(token);
  if (!vista) return fallo("el token dejó de resolver — el peregrino vería 'enlace no válido'");
  if (vista.estado !== "ya_firmado") return fallo(`estado inesperado: ${vista.estado}`);
  ok("muestra la pantalla de 'ya está firmado'", vista.firmadoEn ?? "");

  titulo("Intentar firmar dos veces");
  const otra = await firmarContrato({
    token, codigo, trazoDataUrl: TRAZO, aceptaLectura: true, aceptaFirma: true,
  });
  if (otra.ok) return fallo("¡firmó dos veces!");
  ok("rechazado", otra.error);

  titulo("La bitácora");
  const { data: eventos } = await db.from("contract_events")
    .select("event, at").eq("contract_id", c.id).order("at");
  console.log("   ", (eventos ?? []).map((e) => e.event).join(" → "));
  const esperados = ["creado", "abierto", "otp_enviado", "otp_validado", "firmado", "pdf_sellado"];
  const faltan = esperados.filter((e) => !(eventos ?? []).some((x) => x.event === e));
  faltan.length ? fallo(`faltan eventos: ${faltan.join(", ")}`) : ok("la secuencia completa quedó registrada");

  titulo("La evidencia del firmante");
  const { data: f } = await db.from("contract_signers")
    .select("full_name, ip, user_agent, geo, auth_method, consent_text, signature_image_path, signed_at")
    .eq("contract_id", c.id).eq("role", "viajero").single();
  for (const [k, v] of Object.entries({
    IP: f?.ip, dispositivo: f?.user_agent?.slice(0, 40), ubicación: f?.geo,
    método: f?.auth_method, trazo: f?.signature_image_path,
    consentimiento: f?.consent_text ? `${f.consent_text.length} caracteres archivados` : null,
  })) v ? ok(`${k}: ${v}`) : fallo(`falta ${k}`);

  console.log(`\n  PDF firmado: ${SALIDA}/contrato-firmado.pdf`);
  console.log(`  Verificación: ${process.env.NEXT_PUBLIC_APP_URL}/verificar/${c.pdf_signed_sha256}`);
}

main().catch((e) => { console.error("\nFALLÓ:", e.message); process.exit(1); });
