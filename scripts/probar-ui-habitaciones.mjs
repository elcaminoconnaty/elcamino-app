/** Verifica que la pestaña de Reservas y el encabezado del camino rendericen lo nuevo. */
import { createClient } from "@supabase/supabase-js";
const URLS = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(URLS).hostname.split(".")[0];
const admin = createClient(URLS, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: profiles } = await admin.from("profiles").select("id").in("app_role", ["nico","naty","admin"]).limit(1);
const { data: u } = await admin.auth.admin.getUserById(profiles[0].id);
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
const anon = createClient(URLS, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess } = await anon.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
const raw = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64");
const cookie = `sb-${REF}-auth-token=${raw}`;

const DEP = "9c1a3bf2-072d-456e-9f69-096c5bb49268";
let fallos = 0;
const check = (ok, m) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };

for (const [tab, esperados] of [
  ["resumen", ["Habitaciones", "Peregrinos", `/api/export/caminos/${DEP}/habitaciones`, `/api/export/caminos/${DEP}/peregrinos`]],
  ["reservas", ["Repartidos", "tab=habitaciones", "Pensión Portomiño"]],
  ["contratos", ["Contratos del camino", "Enviar a todos"]],
  ["habitaciones", [
    "rooming list de toda la ruta",
    "Replicar una noche a todas",
    "Pensión Portomiño",
    "Parador Santiago",
    "noches repartidas",
    "cama libre",
    "Beatriz Garzón",
    "no duerme acá",
  ]],
]) {
  const res = await fetch(`http://localhost:3011/caminos/${DEP}?tab=${tab}`, { headers: { cookie }, redirect: "manual" });
  const html = await res.text();
  console.log(`\n?tab=${tab} → ${res.status} · ${html.length} bytes`);
  check(res.status === 200, "responde 200");
  for (const e of esperados) check(html.includes(e), `contiene "${e}"`);
  const err = html.match(/Application error|Unhandled Runtime Error|TypeError: [^<"]{0,120}/);
  check(!err, err ? `sin errores en el HTML — ENCONTRADO: ${err[0]}` : "sin errores en el HTML");
}
console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
