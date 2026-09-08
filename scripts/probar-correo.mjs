/**
 * Revisa, de punta a punta, si la plataforma puede mandar correos — y opcionalmente manda
 * uno de prueba.
 *
 * Existe porque el fallo del 2026-09-07 (el primer contrato de verdad que nunca salió) no se
 * veía por ningún lado: la acción respondía bien, el peregrino no recibía nada y había que
 * entrar a `email_log` para enterarse. Los cuatro motivos por los que esto se cae —falta la
 * clave, el dominio no está autenticado, el remitente no existe en Brevo, Brevo rechaza el
 * envío— dan errores distintos y acá se distinguen antes de que Naty le dé al botón.
 *
 *   node --env-file=.env.local scripts/probar-correo.mjs
 *   node --env-file=.env.local scripts/probar-correo.mjs alguien@ejemplo.com
 *
 * Sin dirección solo diagnostica y no manda nada. Con dirección, manda un correo de prueba
 * a esa dirección: úsalo con un buzón tuyo, nunca con el de un peregrino.
 */
import { resolveTxt, resolveCname } from "node:dns/promises";

const destino = process.argv[2] ?? null;
const apiKey = process.env.BREVO_API_KEY;
const remitente = process.env.BREVO_SENDER_EMAIL;

const ok = (t) => console.log(`  ✓ ${t}`);
const mal = (t) => console.log(`  ✗ ${t}`);
const nota = (t) => console.log(`    ${t}`);
let fatal = false;

async function brevo(ruta, opciones = {}) {
  const r = await fetch(`https://api.brevo.com/v3${ruta}`, {
    ...opciones,
    headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await r.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    // Brevo devolvió algo que no es JSON; el texto crudo sirve igual para el diagnóstico.
  }
  return { estado: r.status, ok: r.ok, datos, texto };
}

console.log("\n1. Variables de entorno");
if (!apiKey) {
  // No es fatal: sin clave no se puede hablar con Brevo, pero el DNS —que es lo que suele
  // faltar— se revisa igual, y esa es la parte que uno repite mientras espera la propagación.
  mal("Falta BREVO_API_KEY. Se revisa el DNS igual, pero no se puede consultar a Brevo.");
  nota("Se genera en Brevo → SMTP & API → API Keys.");
} else {
  ok(`BREVO_API_KEY presente (${apiKey.slice(0, 10)}…, ${apiKey.length} caracteres).`);
}
if (!remitente) {
  mal("Falta BREVO_SENDER_EMAIL.");
  fatal = true;
} else if (/@gmail\.com$/i.test(remitente)) {
  mal(`BREVO_SENDER_EMAIL es ${remitente}: un @gmail.com no se puede firmar desde Brevo.`);
  nota("Outlook y Hotmail lo mandan a spam, y el código de firma dura 10 minutos.");
  fatal = true;
} else {
  ok(`Remitente: ${remitente}`);
}
if (fatal) {
  console.log("\nSin un remitente válido no hay nada más que revisar.\n");
  process.exit(1);
}

const dominio = remitente.split("@")[1];

console.log(`\n2. DNS de ${dominio} (lo que ve un resolver: puede ir detrás de lo publicado)`);
// Brevo autentica con dos CNAME de DKIM y un TXT con su código; no pide SPF. Se consulta el
// DNS público y no el panel de Brevo porque es donde de verdad tiene que estar el registro,
// y porque Brevo cachea su propia verificación.
for (const sel of ["brevo1", "brevo2"]) {
  const nombre = `${sel}._domainkey.${dominio}`;
  try {
    const destino = (await resolveCname(nombre))[0];
    const esperado = `b${sel[5]}.${dominio.replace(/\./g, "-")}.dkim.brevo.com`;
    destino === esperado
      ? ok(`DKIM ${sel}: apunta a ${destino}`)
      : mal(`DKIM ${sel}: apunta a ${destino}, y debería ser ${esperado}`);
  } catch {
    mal(`DKIM ${sel}: el CNAME ${nombre} no existe.`);
  }
}
try {
  const txt = (await resolveTxt(dominio)).map((p) => p.join(""));
  txt.some((t) => t.startsWith("brevo-code:"))
    ? ok("Código de verificación de Brevo presente en el TXT del dominio.")
    : mal("Falta el TXT brevo-code: en la raíz del dominio.");
} catch {
  mal("El dominio no responde registros TXT.");
}
try {
  const d = (await resolveTxt(`_dmarc.${dominio}`)).flat().join("");
  ok(`DMARC: ${d}`);
} catch {
  mal("DMARC: no existe. No bloquea el envío, pero Gmail y Outlook lo piden para remitentes nuevos.");
}

if (!apiKey) {
  console.log("\nHasta acá llega sin BREVO_API_KEY. Ponla en .env.local y vuelve a correrlo.\n");
  process.exit(1);
}

console.log("\n3. Cuenta de Brevo");
const cuenta = await brevo("/account");
if (!cuenta.ok) {
  mal(`La clave no sirve: Brevo respondió ${cuenta.estado}. ${cuenta.datos?.message ?? cuenta.texto.slice(0, 120)}`);
  process.exit(1);
}
ok(`Cuenta: ${cuenta.datos?.companyName ?? "(sin nombre)"} — ${cuenta.datos?.email ?? ""}`);
const credito = cuenta.datos?.plan?.find?.((p) => p.credits != null);
if (credito) nota(`Créditos disponibles: ${credito.credits} (${credito.type}).`);

console.log("\n4. El remitente está dado de alta");
const remitentes = await brevo("/senders");
if (remitentes.ok) {
  const lista = remitentes.datos?.senders ?? [];
  const mio = lista.find((s) => s.email?.toLowerCase() === remitente.toLowerCase());
  if (mio) ok(`${remitente} está en Brevo${mio.active === false ? " pero figura inactivo" : ""}.`);
  else {
    mal(`${remitente} no aparece entre los remitentes de esta cuenta.`);
    nota(`Los que hay: ${lista.map((s) => s.email).join(", ") || "ninguno"}`);
  }
} else {
  mal(`No se pudo leer la lista de remitentes (${remitentes.estado}).`);
}

const dominios = await brevo("/senders/domains");
if (dominios.ok) {
  const d = (dominios.datos?.domains ?? []).find((x) => x.domain_name?.toLowerCase() === dominio);
  if (!d) mal(`${dominio} no está agregado como dominio en esta cuenta de Brevo.`);
  else if (d.authenticated) ok(`${dominio} está autenticado (DKIM y SPF validados por Brevo).`);
  else {
    mal(`${dominio} está agregado pero SIN autenticar: Brevo todavía no ve los registros.`);
    nota("El DNS tarda; si los registros ya están puestos, dale a 'Verificar' en Brevo y reintenta.");
  }
} else {
  nota(`No se pudo leer el estado de los dominios (${dominios.estado}); revísalo en el panel.`);
}

if (!destino) {
  console.log("\nDiagnóstico terminado. Para mandar un correo de prueba:");
  console.log("  node --env-file=.env.local scripts/probar-correo.mjs tu-correo@ejemplo.com\n");
  process.exit(0);
}

console.log(`\n5. Envío de prueba a ${destino}`);
const envio = await brevo("/smtp/email", {
  method: "POST",
  body: JSON.stringify({
    sender: { name: "El Camino con Naty", email: remitente },
    to: [{ email: destino }],
    replyTo: { email: "elcaminoconnaty@gmail.com", name: "El Camino con Naty" },
    subject: "Prueba de correo de la plataforma",
    textContent:
      "Si estás leyendo esto, la plataforma ya puede mandar correos.\n\n" +
      `Salió desde ${remitente} a las ${new Date().toLocaleString("es-CO")}.`,
    htmlContent:
      '<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;">' +
      "Si estás leyendo esto, la plataforma ya puede mandar correos.</p>" +
      `<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b6257;">Salió desde ${remitente} a las ${new Date().toLocaleString("es-CO")}.</p>`,
  }),
});
if (!envio.ok) {
  mal(`Brevo rechazó el envío (${envio.estado}): ${envio.datos?.message ?? envio.texto.slice(0, 200)}`);
  process.exit(1);
}
ok(`Aceptado. messageId: ${envio.datos?.messageId ?? "(Brevo no devolvió uno)"}`);
// "Aceptado" no es "llegó": es la misma distinción que hace `email_log.status`.
console.log("\nRevisa la bandeja —y la carpeta de spam— de", destino, "\n");
