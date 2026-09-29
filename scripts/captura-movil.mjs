/**
 * Mira la plataforma como en un iPhone (390×844, pantalla de 3x) con la sesión del equipo, contra el
 * servidor LOCAL (npm run dev -- -p 3011, que lee la base de producción: SOLO MIRA, no toca nada).
 *
 *   node --env-file=.env.local scripts/captura-movil.mjs <carpeta-salida> <ruta> [<ruta> …]
 *   node --env-file=.env.local scripts/captura-movil.mjs <carpeta-salida> --todas
 *
 * Por cada ruta deja <slug>.png (página completa) y un informe.json con lo que se sale de la
 * pantalla, textos cortados con "…", elementos que se montan unos sobre otros y botones de menos
 * de 32 px de alto. La sesión sale de un enlace mágico generado con la llave de servicio (no se
 * escribe ninguna contraseña) y vive solo en un perfil temporal de Chrome que se borra al final.
 */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOCAL = process.env.CAPTURA_BASE ?? "http://localhost:3011";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EMAIL = process.env.CAPTURA_EMAIL ?? "elcaminoconnaty@gmail.com";
const ANCHO = Number(process.env.CAPTURA_ANCHO ?? 390);
const [salida, ...args] = process.argv.slice(2);
if (!salida || !args.length) { console.error("Uso: captura-movil.mjs <salida> <ruta…|--todas>"); process.exit(1); }
fs.mkdirSync(salida, { recursive: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function rutasTodas() {
  const { data: deps } = await admin.from("departures").select("id, start_date").order("start_date", { ascending: false });
  const { data: regs } = await admin.from("registrations").select("id, pilgrim_id, departure_id").limit(2000);
  const { data: provs } = await admin.from("providers").select("id").limit(1);
  const tabs = ["resumen", "pagos", "liquidacion", "peregrinos", "contratos", "presupuesto", "viaticos", "reservas", "habitaciones", "cenas", "gastos", "documento", "videos"];
  const rutas = ["/", "/dashboard/naty", "/dashboard/nico", "/caminos", "/caminos/nuevo", "/peregrinos", "/pagos", "/pagos-proveedores", "/proveedores", "/gastos", "/trm", "/configuracion"];
  for (const d of (deps ?? []).slice(0, 2)) {
    for (const t of tabs) rutas.push(`/caminos/${d.id}?tab=${t}`);
    rutas.push(`/caminos/${d.id}/wizard`);
  }
  const r = (regs ?? []).find((x) => x.departure_id === deps?.[0]?.id);
  if (r) { rutas.push(`/peregrinos/${r.pilgrim_id}`, `/peregrinos/${r.pilgrim_id}/carta/${r.id}`); }
  if (provs?.[0]) rutas.push(`/proveedores/${provs[0].id}`);
  return rutas;
}
const rutas = args[0] === "--todas" ? await rutasTodas() : args;

// Sesión: enlace mágico → token → cookie de @supabase/ssr ("base64-" + JSON, en trozos).
const { data: link, error: e1 } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
if (e1) throw e1;
const { data: ses, error: e2 } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
if (e2) throw e2;
const ref = new URL(url).hostname.split(".")[0];
const valor = "base64-" + Buffer.from(JSON.stringify(ses.session)).toString("base64url");
const TROZO = 3180;
const cookies = [];
if (valor.length <= TROZO) cookies.push({ name: `sb-${ref}-auth-token`, value: valor });
else for (let i = 0; i * TROZO < valor.length; i++) cookies.push({ name: `sb-${ref}-auth-token.${i}`, value: valor.slice(i * TROZO, (i + 1) * TROZO) });

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "captura-movil-"));
const puerto = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let destino;
for (let i = 0; i < 60 && !destino; i++) {
  await esperar(250);
  destino = await fetch(`http://127.0.0.1:${puerto}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
}
const ws = new WebSocket(destino.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let n = 0;
const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m); });
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluar = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await cdp("Page.enable");
await cdp("Network.enable");
for (const c of cookies) await cdp("Network.setCookie", { ...c, url: LOCAL, path: "/", httpOnly: false });
await cdp("Emulation.setDeviceMetricsOverride", { width: ANCHO, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });

// Lo que se revisa en cada pantalla, dentro de la página.
const REVISAR = `(() => {
  const W = innerWidth, out = { anchoDoc: document.documentElement.scrollWidth, desborda: [], cortados: [], montados: [], botonesChicos: [], titulo: document.title, url: location.pathname + location.search };
  const desc = (el) => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 4).join('.') : '') + ' "' + (el.innerText || el.value || '').trim().slice(0, 50).replace(/\\n/g, ' ') + '"');
  const dentroDeScroll = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
  const visibles = [...document.body.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; });
  for (const el of visibles) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (r.right > W + 1 && !dentroDeScroll(el)) out.desborda.push(desc(el));
    if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.cortados.push(desc(el));
    if (el.matches('button, a[href], [role=button], input, select') && r.height < 32 && r.width > 0 && !el.closest('nav')) out.botonesChicos.push(desc(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  // Solapes: controles interactivos que se pisan con texto u otros controles (no anidados).
  const ctrls = visibles.filter((el) => el.matches('button, a[href], input, select, textarea, [role=button]'));
  const textos = visibles.filter((el) => el.childNodes.length && [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && !el.closest('button, a'));
  const inter = (a, b) => { const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)); const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); return x * y; };
  const fijo = (el) => { for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.position === 'fixed' || s.position === 'sticky') return true; } return false; };
  for (const c of ctrls) {
    if (fijo(c)) continue;
    const rc = c.getBoundingClientRect();
    for (const t of [...ctrls, ...textos]) {
      if (t === c || t.contains(c) || c.contains(t) || fijo(t)) continue;
      const rt = t.getBoundingClientRect();
      const a = inter(rc, rt);
      if (a > 40 && a > 0.15 * Math.min(rc.width * rc.height, rt.width * rt.height)) out.montados.push(desc(c) + '  ⟷  ' + desc(t));
    }
  }
  for (const k of ['desborda', 'cortados', 'montados', 'botonesChicos']) out[k] = [...new Set(out[k])].slice(0, 25);
  return out;
})()`;

const informe = [];
for (const ruta of rutas) {
  await cdp("Page.navigate", { url: LOCAL + ruta });
  await esperar(4500);
  const r = await evaluar(REVISAR);
  const slug = ruta.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 90) || "inicio";
  const alto = Math.min(await evaluar("document.documentElement.scrollHeight"), 9000);
  const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: ANCHO, height: alto, scale: 1 } });
  if (shot.result?.data) fs.writeFileSync(path.join(salida, `${slug}.png`), Buffer.from(shot.result.data, "base64"));
  informe.push({ ruta, png: `${slug}.png`, ...r });
  const malo = r && (r.anchoDoc > ANCHO + 1 || r.desborda.length || r.montados.length);
  console.log(`${malo ? "✗" : "✓"} ${ruta}  ancho ${r?.anchoDoc} · desborda ${r?.desborda.length} · montados ${r?.montados.length} · cortados ${r?.cortados.length} · chicos ${r?.botonesChicos.length}${r?.url !== ruta ? `  (terminó en ${r?.url})` : ""}`);
}
fs.writeFileSync(path.join(salida, "informe.json"), JSON.stringify(informe, null, 2));
ws.close();
chrome.kill();
await esperar(800);
try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
