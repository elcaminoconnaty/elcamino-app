/** Las pantallas nuevas (asistente, actividad, equipo) y el armazón móvil renderizan con sesión.
 *    npx next dev -p 3011   ·   node --env-file=.env.local scripts/probar-ui-equipo.mjs */
import { createClient } from "@supabase/supabase-js";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "elcaminoconnaty@gmail.com" });
const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess } = await anon.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
const cookie = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(sess.session)).toString("base64")}`;
let fallos = 0;
const check = (ok, m) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };
const pagina = async (ruta) => {
  const r = await fetch(`http://localhost:3011${ruta}`, { headers: { cookie }, redirect: "manual" });
  return { status: r.status, html: await r.text() };
};
for (const [ruta, debe] of [
  ["/asistente", ["Asistente", "Escribí tu pregunta", "Quién falta por firmar"]],
  ["/actividad", ["Actividad", "Preguntas al asistente", "Nathalia", "Nicolás"]],
  ["/actividad?ver=preguntas", ["preguntó"]],
  ["/configuracion", ["Equipo", "pendiente: crea su contraseña", "Cambiar mi contraseña"]],
  ["/caminos", ["Navegación principal", "safe-area-inset-top", "Más opciones"]],
]) {
  const { status, html } = await pagina(ruta);
  check(status === 200, `${ruta} → ${status}`);
  for (const d of debe) check(html.includes(d), `${ruta} contiene "${d}"`);
}
const { html } = await pagina("/caminos");
check(html.includes("viewport-fit=cover"), "viewport-fit=cover dentro de la plataforma");
check(html.includes("apple-touch-startup-image"), "pantallas de arranque declaradas");
check(html.includes("black-translucent"), "barra de estado translúcida");
const login = await (await fetch("http://localhost:3011/login")).text();
check(!login.includes("viewport-fit=cover"), "login sin viewport-fit=cover");
const mani = await fetch("http://localhost:3011/manifest.webmanifest", { redirect: "manual" });
check(mani.status === 200, `manifest sin sesión → ${mani.status}`);
console.log(fallos ? `\n${fallos} fallos` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
