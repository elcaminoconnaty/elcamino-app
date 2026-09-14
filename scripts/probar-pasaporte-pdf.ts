/**
 * Prueba que un pasaporte en PDF se lea igual que una foto.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/probar-pasaporte-pdf.ts
 *
 * Arma un PDF de una página con datos de pasaporte inventados y su MRZ, lo sube al
 * bucket, lo pasa por el mismo `extraerDatosPasaporte` que usa la plataforma y compara
 * lo que devolvió Claude con lo que se escribió. No toca ningún peregrino y borra el
 * archivo de prueba al terminar.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createAdminClient } from "@/lib/supabase/admin";
import { extraerDatosPasaporte } from "@/lib/passport/extraer";
import { revisarArchivoDePasaporte, tipoDeArchivoDePasaporte } from "@/lib/passport/formatos";

let fallos = 0;
const check = (ok: boolean, m: string) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${m}`);
  if (!ok) fallos++;
};

/** Un PDF de una página, armado a mano: sin dependencias y con el xref bien calculado. */
function pdfDeUnaPagina(lineas: string[]): Buffer {
  const texto = lineas
    .map((l, i) => `BT /F1 13 Tf 50 ${720 - i * 22} Td (${l.replace(/([()\\])/g, "\\$1")}) Tj ET`)
    .join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((cuerpo, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });
  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function main() {
  console.log("— Validación en el navegador (sin subir nada) —");
  check(tipoDeArchivoDePasaporte("application/pdf") === "pdf", "un PDF se clasifica como documento");
  check(tipoDeArchivoDePasaporte("image/jpeg") === "imagen", "un JPG se clasifica como imagen");
  check(tipoDeArchivoDePasaporte("image/heic") === null, "un HEIC se rechaza");
  const avisoHeic = revisarArchivoDePasaporte({ type: "image/heic", size: 1000, name: "foto.heic" } as File);
  check(!!avisoHeic && avisoHeic.includes("iPhone"), `el aviso del HEIC explica qué hacer: "${avisoHeic?.slice(0, 60)}…"`);
  const avisoGordo = revisarArchivoDePasaporte({ type: "application/pdf", size: 30 * 1024 * 1024, name: "p.pdf" } as File);
  check(!!avisoGordo && avisoGordo.includes("MB"), `un PDF de 30 MB se frena antes de subir: "${avisoGordo}"`);
  check(revisarArchivoDePasaporte({ type: "application/pdf", size: 200_000, name: "p.pdf" } as File) === null, "un PDF normal pasa");

  const ESPERADO = {
    full_name: "MARIA FERNANDA GOMEZ RIVERA",
    passport_number: "AT4829173",
    nationality: "COLOMBIANA",
    birth_date: "1984-03-17",
    passport_expiry_date: "2031-05-22",
    sex: "F",
  };

  const pdf = pdfDeUnaPagina([
    "REPUBLICA DE COLOMBIA - PASAPORTE",
    "Tipo / Type: P        Codigo / Code: COL",
    "Pasaporte No. / Passport No.: AT4829173",
    "Apellidos / Surname: GOMEZ RIVERA",
    "Nombres / Given names: MARIA FERNANDA",
    "Nacionalidad / Nationality: COLOMBIANA",
    "Fecha de nacimiento / Date of birth: 17 MAR 1984",
    "Sexo / Sex: F     Lugar de nacimiento: BOGOTA D.C.",
    "Fecha de expedicion / Date of issue: 22 MAY 2021",
    "Fecha de vencimiento / Date of expiry: 22 MAY 2031",
    "",
    "P<COLGOMEZ<RIVERA<<MARIA<FERNANDA<<<<<<<<<<<<",
    "AT48291736COL8403171F3105224<<<<<<<<<<<<<<02",
  ]);
  console.log(`\n— PDF de prueba armado: ${(pdf.length / 1024).toFixed(1)} KB —`);

  const admin = createAdminClient();
  const ruta = `_prueba/${Date.now()}.pdf`;
  const { error: upErr } = await admin.storage
    .from("passports")
    .upload(ruta, pdf, { contentType: "application/pdf" });
  check(!upErr, `el bucket acepta el PDF${upErr ? ` — ${upErr.message}` : ""}`);

  if (!upErr) {
    try {
      console.log("\n— Lectura con Claude —");
      const datos = await extraerDatosPasaporte(admin, ruta);
      console.log(JSON.stringify(datos, null, 2));
      for (const [campo, valor] of Object.entries(ESPERADO)) {
        const leido = (datos as any)[campo];
        check(
          String(leido ?? "").toUpperCase().replace(/\s+/g, " ") === valor.toUpperCase(),
          `${campo}: leyó "${leido}" y esperábamos "${valor}"`
        );
      }
      check(!!datos.mrz && datos.mrz.includes("AT4829173"), "sacó la MRZ del texto del PDF");
    } catch (e: any) {
      check(false, `la lectura falló: ${e.message}`);
    }
    await admin.storage.from("passports").remove([ruta]);
    console.log(`\n  · archivo de prueba borrado (${ruta})`);
  }

  console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
  process.exit(fallos ? 1 : 0);
}

main();
