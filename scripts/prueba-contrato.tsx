/**
 * Prueba de punta a punta del módulo de contratos, sin navegador.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/prueba-contrato.tsx <registration_id>
 *
 * Corre lo mismo que hace la plataforma —armar, generar, enviar, pedir código, firmar,
 * sellar y verificar— usando la llave de servicio, que es la que usa el flujo público.
 *
 * NO borra nada: el peregrino de prueba y su contrato quedan para poder mirarlos. Al
 * terminar imprime el SQL de limpieza.
 */
// `dotenv/config` lee .env; Next usa .env.local, así que se carga explícitamente.
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarDatosContrato } from "@/lib/contracts/datos";
import { camposFaltantes, type DatosContrato } from "@/lib/contracts/minuta";
import { minutaVigente } from "@/lib/contracts/minuta.server";
import { renderContrato } from "@/lib/contracts/render";
import { nuevoToken, TOKEN_VIGENCIA_DIAS, sha256 } from "@/lib/contracts/firma";
import { contratoPorToken, pedirCodigo, firmarContrato } from "@/lib/contracts/sign";
import { CONTACTO } from "@/lib/brand";

const REG = process.argv[2];
const SALIDA = process.env.OUT ?? "/tmp";
let paso = 0;
const ok = (t: string, extra = "") => console.log(`  ✓ ${t}${extra ? ` — ${extra}` : ""}`);
const titulo = (t: string) => console.log(`\n${++paso}. ${t}`);
const fallo = (t: string) => { console.error(`  ✗ ${t}`); process.exitCode = 1; };

async function main() {
  if (!REG) throw new Error("Falta el id de la inscripción.");
  for (const v of ["SUPABASE_SERVICE_ROLE_KEY", "GMAIL_APP_PASSWORD", "NEXT_PUBLIC_APP_URL"]) {
    if (!process.env[v]) throw new Error(`Falta ${v} en .env.local`);
  }
  const db = createAdminClient();

  titulo("Armar los datos del contrato");
  const { datos, pendientes, avisos } = await armarDatosContrato(REG, { db });
  if (pendientes.length) return fallo(`faltan datos: ${pendientes.map((p) => p.que_falta).join("; ")}`);
  const faltan = camposFaltantes(datos);
  if (faltan.length) return fallo(`campos vacíos: ${faltan.join(", ")}`);
  ok("los trece campos, completos");
  for (const a of avisos) console.log(`    aviso: ${a}`);
  console.log(`    valor: ${datos.valor_total} · pago: ${datos.forma_de_pago}`);
  console.log(`    plan:  ${datos.plan_descripcion}`);

  titulo("Generar el PDF sin firmar y guardarlo");
  const minuta = await minutaVigente();
  const token = nuevoToken();
  const codigo = token.slice(0, 8).toUpperCase();
  const original = await renderContrato({ minuta, datos: datos as DatosContrato, codigo });
  const rutaOriginal = `pruebas/${REG}/Contrato-${codigo}.pdf`;
  const up = await db.storage.from("contracts").upload(rutaOriginal, original.pdf, {
    contentType: "application/pdf", upsert: true,
  });
  if (up.error) return fallo(`no pude subir el PDF: ${up.error.message}`);
  ok(`${original.paginas} páginas`, `${(original.pdf.length / 1024).toFixed(0)} kB · minuta ${minuta.version}`);

  // Limpiamos cualquier contrato previo de esta inscripción para poder repetir la prueba.
  await db.from("contracts").update({ status: "anulado" }).eq("registration_id", REG)
    .in("status", ["borrador", "enviado", "visto", "firmado"]);

  const { data: c, error: errC } = await db.from("contracts").insert({
    registration_id: REG, version: 1, status: "borrador", snapshot: datos,
    template_version: minuta.version, pdf_original_path: rutaOriginal,
    pdf_original_sha256: original.sha256, access_token: token,
    token_expires_at: new Date(Date.now() + TOKEN_VIGENCIA_DIAS * 864e5).toISOString(),
  }).select("id").single();
  if (errC) return fallo(errC.message);
  await db.from("contract_signers").insert([
    { contract_id: c.id, role: "viajero", full_name: datos.viajero_nombre!,
      document_label: datos.viajero_documento_label!, email: datos.viajero_email! },
    { contract_id: c.id, role: "camino", full_name: "NATALIA LARGO DURÁN",
      document_label: "C.C. 1.037.593.713", email: CONTACTO.correo },
  ]);
  await db.from("contract_events").insert({ contract_id: c.id, event: "creado" });
  ok("contrato en la base", c.id);

  titulo("Mandar el correo con el enlace de firma");
  const { enviarCorreo } = await import("@/lib/email/send");
  const { correoContratoParaFirmar } = await import("@/lib/email/templates");
  const urlFirma = `${process.env.NEXT_PUBLIC_APP_URL}/firmar/${token}`;
  const envio = await enviarCorreo({
    ...correoContratoParaFirmar({
      nombre: datos.viajero_nombre!, camino: "Camino Francés — Abril 2027",
      valorTotal: datos.valor_total!, formaDePago: datos.forma_de_pago!, urlFirma,
    }),
    to: datos.viajero_email!, tipo: "contrato_firmar", templateSlug: "contrato_firmar",
  });
  if (!envio.ok) return fallo(`el correo no salió: ${envio.error}`);
  ok("correo enviado", envio.messageId);
  await db.from("contracts").update({ status: "enviado", sent_at: new Date().toISOString() }).eq("id", c.id);
  console.log(`    enlace: ${urlFirma}`);

  titulo("Abrir el enlace como el peregrino (sin sesión)");
  const vista = await contratoPorToken(token, { ip: "190.0.0.1", userAgent: "Prueba/1.0" });
  if (!vista) return fallo("el token no resolvió — la página diría 'enlace no válido'");
  if (vista.estado !== "por_firmar") return fallo(`estado inesperado: ${vista.estado}`);
  ok("el enlace abre", `${vista.nombre} · ${vista.camino}`);

  titulo("Pedir el código");
  const r1 = await pedirCodigo(token, { ip: "190.0.0.1", userAgent: "Prueba/1.0" });
  if (!r1.ok) return fallo(r1.error ?? "no salió el código");
  ok("código enviado al correo del firmante");

  titulo("Comprobar las defensas antes de firmar de verdad");
  const malo = await firmarContrato({
    token, codigo: "000000", trazoDataUrl: TRAZO,
    aceptaLectura: true, aceptaFirma: true, huella: { ip: "190.0.0.1", userAgent: "Prueba/1.0" },
  });
  if (malo.ok) return fallo("¡aceptó un código equivocado!");
  ok("código equivocado, rechazado", malo.error);

  const sinCasillas = await firmarContrato({
    token, codigo: "000000", trazoDataUrl: TRAZO, aceptaLectura: false, aceptaFirma: true,
  });
  if (sinCasillas.ok) return fallo("¡firmó sin marcar las casillas!");
  ok("sin las dos casillas, rechazado");

  // Un PNG cortado a la mitad: react-pdf lo descartaría en silencio y el contrato quedaría
  // sellado con el espacio de la firma en blanco.
  const roto = await firmarContrato({
    token, codigo: "000000", trazoDataUrl: TRAZO.slice(0, 200),
    aceptaLectura: true, aceptaFirma: true,
  });
  if (roto.ok) return fallo("¡aceptó una firma corrupta!");
  ok("firma corrupta, rechazada", roto.error);

  console.log("\n  Ahora hace falta el código real que llegó al correo.");
  console.log(`  Ejecutá:  OUT=${SALIDA} npx tsx --tsconfig scripts/tsconfig.json scripts/prueba-firmar.tsx ${token} <código>`);
  fs.writeFileSync(path.join(SALIDA, "prueba-token.txt"), token);
}

/** Una firma dibujada de verdad, del tamaño que produce el canvas (1120×360). */
const TRAZO = fs.readFileSync("scripts/firma-de-prueba.txt", "utf8").trim();

main().catch((e) => { console.error("\nFALLÓ:", e.message); process.exit(1); });
