/**
 * El peregrino sube su pasaporte en PDF desde el enlace público de inscripción.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/probar-registro-pdf.ts
 *
 * OJO: corre contra la base de PRODUCCIÓN. Crea un peregrino de prueba con su inscripción
 * y su token, sube un PDF de pasaporte inventado por el mismo camino que usa el
 * formulario, comprueba lo que leyó y borra todo lo que creó.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { urlSubidaPasaporte, leerPasaporte } from "@/lib/registro/por-token";
import { revisarArchivoDePasaporte } from "@/lib/passport/formatos";

const DEP = "9c1a3bf2-072d-456e-9f69-096c5bb49268";
const NOMBRE = "Prueba PDF (borrar)";
let fallos = 0;
const check = (ok: boolean, m: string) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };

/** Un PDF de una página con datos de pasaporte y su MRZ. */
function pdfDePasaporte(lineas: string[]): Buffer {
  const texto = lineas.map((l, i) => `BT /F1 13 Tf 50 ${720 - i * 22} Td (${l.replace(/([()\\])/g, "\\$1")}) Tj ET`).join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((cuerpo, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`; });
  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function main() {
  const admin = createAdminClient();

  console.log("— Lo que el formulario acepta y lo que no —");
  check(revisarArchivoDePasaporte({ type: "application/pdf", size: 120_000, name: "p.pdf" } as File) === null, "un PDF pasa");
  check(revisarArchivoDePasaporte({ type: "image/jpeg", size: 120_000, name: "p.jpg" } as File) === null, "una foto JPG pasa");
  const heic = revisarArchivoDePasaporte({ type: "image/heic", size: 120_000, name: "p.heic" } as File);
  check(!!heic, `un HEIC se frena con instrucciones: "${heic?.slice(0, 50)}…"`);

  // ── Sembrar ───────────────────────────────────────────────────────────────
  const { data: p, error: e1 } = await admin.from("pilgrims").insert({ full_name: NOMBRE, email: "prueba-pdf@example.com", country: "Colombia" }).select("id").single();
  if (e1) throw new Error(e1.message);
  const { data: r, error: e2 } = await admin.from("registrations").insert({ pilgrim_id: p.id, departure_id: DEP, total_eur: 0, paid_in_cop_originally: true, status: "pre_inscrito" }).select("id").single();
  if (e2) throw new Error(e2.message);

  const { data: dep } = await admin.from("departures").select("registration_token").eq("id", DEP).maybeSingle();
  const tokenPrevio = dep?.registration_token ?? null;
  const token = tokenPrevio ?? "f0f0" + crypto.randomBytes(30).toString("hex");
  if (!tokenPrevio) await admin.from("departures").update({ registration_token: token, registration_token_created_at: new Date().toISOString() }).eq("id", DEP);

  try {
    console.log("\n— El peregrino sube su PDF —");
    const u = await urlSubidaPasaporte(token, r.id, "mi-pasaporte.pdf");
    check(u.ok, `el enlace público da la URL de subida${u.ok ? ` (${(u as any).path})` : `: ${(u as any).error}`}`);
    if (!u.ok) throw new Error("sin URL de subida");

    const pdf = pdfDePasaporte([
      "REPUBLICA DE COLOMBIA - PASAPORTE",
      "Pasaporte No. / Passport No.: AQ9988776",
      "Apellidos / Surname: VELEZ OSPINA",
      "Nombres / Given names: ANDRES FELIPE",
      "Nacionalidad / Nationality: COLOMBIANA",
      "Fecha de nacimiento / Date of birth: 05 NOV 1979",
      "Sexo / Sex: M",
      "Fecha de vencimiento / Date of expiry: 14 AGO 2033",
      "",
      "P<COLVELEZ<OSPINA<<ANDRES<FELIPE<<<<<<<<<<<<<<",
      "AQ99887761COL7911053M3308142<<<<<<<<<<<<<<06",
    ]);
    const { error: upErr } = await admin.storage.from("passports").uploadToSignedUrl((u as any).path, (u as any).uploadToken, pdf, { contentType: "application/pdf" });
    check(!upErr, `el bucket acepta el PDF del peregrino${upErr ? ` — ${upErr.message}` : ""}`);

    const leido = await leerPasaporte(token, r.id, (u as any).path);
    check(leido.ok, `la lectura respondió${leido.ok ? "" : `: ${(leido as any).error}`}`);
    if (leido.ok) {
      const l = leido as any;
      console.log(`  · devuelve al formulario: nº ${l.passport_number} · nacimiento ${l.birth_date} · nombre ${l.full_name}`);
      check(l.passport_number === "AQ9988776", "sacó el número de pasaporte del PDF");
      check(l.birth_date === "1979-11-05", "sacó la fecha de nacimiento");
      check(l.full_name === "Andres Felipe Velez Ospina", `compone el nombre con el nombre primero: "${l.full_name}"`);
    }

    const { data: guardado } = await admin.from("pilgrims").select("passport_image_path, passport_number, full_name").eq("id", p.id).maybeSingle();
    check(!!guardado?.passport_image_path?.endsWith(".pdf"), `guardó el PDF en la ficha (${guardado?.passport_image_path})`);
    check(guardado?.full_name === NOMBRE, "no le pisó el nombre: eso lo escribe la persona");
  } finally {
    // ── Limpiar ─────────────────────────────────────────────────────────────
    const { data: fin } = await admin.from("pilgrims").select("passport_image_path").eq("id", p.id).maybeSingle();
    if (fin?.passport_image_path) await admin.storage.from("passports").remove([fin.passport_image_path]);
    await admin.from("registrations").delete().eq("pilgrim_id", p.id);
    await admin.from("pilgrims").delete().eq("id", p.id);
    if (!tokenPrevio) await admin.from("departures").update({ registration_token: null, registration_token_created_at: null }).eq("id", DEP);
    console.log("\n  · peregrino, inscripción y archivo de prueba borrados");
  }

  console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
  process.exit(fallos ? 1 : 0);
}

main();
