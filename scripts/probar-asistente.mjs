/**
 * Le hace una pregunta al asistente contra un `next dev` local y muestra la respuesta en vivo.
 *
 *   ASISTENTE_LOGIN_LOCAL=1 npx next dev -p 3011        (en otra terminal)
 *   node --env-file=.env.local scripts/probar-asistente.mjs "¿Quién falta por firmar de abril?"
 *
 * Entra con la cuenta compartida de antes (no con la de Naty ni la de Nico) para que las
 * pruebas no queden a nombre de nadie en Actividad.
 */
import { createClient } from "@supabase/supabase-js";

const pregunta = process.argv[2] ?? "¿Quién falta por firmar el contrato de abril?";
const BASE = process.env.PRUEBA_URL ?? "http://localhost:3011";
const URLS = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(URLS).hostname.split(".")[0];
const admin = createClient(URLS, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "elcaminoconnaty@gmail.com" });
const anon = createClient(URLS, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess } = await anon.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
const cookie = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(sess.session)).toString("base64")}`;

const t0 = Date.now();
const res = await fetch(`${BASE}/api/asistente`, {
  method: "POST",
  headers: { cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ pregunta }),
});
console.log("HTTP", res.status);
const dec = new TextDecoder();
let buf = "";
for await (const chunk of res.body) {
  buf += dec.decode(chunk, { stream: true });
  const lineas = buf.split("\n");
  buf = lineas.pop();
  for (const l of lineas) {
    if (!l.trim()) continue;
    const ev = JSON.parse(l);
    if (ev.t === "texto") process.stdout.write(ev.d);
    else if (ev.t === "consulta") console.log(`\n[consulta] ${ev.sql.replace(/\s+/g, " ").slice(0, 200)}`);
    else if (ev.t === "fin") console.log(`\n\n[fin] ${ev.consultas.length} consultas · ${ev.modelo} · ${ev.ms} ms`);
    else console.log(`\n[${ev.t}]`, ev.mensaje ?? ev.id ?? "");
  }
}
console.log(`total ${Date.now() - t0} ms`);
