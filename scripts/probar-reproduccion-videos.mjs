/**
 * Abre cada video en un Chrome real (sin ventana), toca "Toca para verlo" como lo haría el
 * peregrino y comprueba que el video de verdad avance, con imagen y sin error. Después salta
 * casi al final para probar que el archivo completo se puede leer.
 * Usa ?vista=equipo: no suma vistas.
 *
 *   node --env-file=.env.local scripts/probar-reproduccion-videos.mjs "<nombre del camino>"
 */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const BASE = "https://elcamino-app-production.up.railway.app";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const camino = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: dep } = await db.from("departures").select("id").eq("name", camino).single();
const { data: videos } = await db.from("pilgrim_videos").select("token, nombre, registrations!inner(departure_id)").eq("registrations.departure_id", dep.id);

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-videos-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${perfil}`, "--mute-audio", "--window-size=390,844", "about:blank"], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let destino;
for (let i = 0; i < 40 && !destino; i++) {
  await esperar(250);
  destino = await fetch("http://127.0.0.1:9333/json/list").then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
}
const ws = new WebSocket(destino.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let n = 0;
const pendientes = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); pendientes.get(m.id)?.(m); });
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; pendientes.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluar = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cdp("Page.enable");

let fallas = 0;
for (const v of videos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))) {
  await cdp("Page.navigate", { url: `${BASE}/video/${v.token}?vista=equipo` });
  await esperar(3500);
  // El toque del peregrino: un clic de verdad (con gesto de usuario) en el centro del botón.
  const caja = await evaluar(`(() => { const b = document.querySelector('button[aria-label="Ver el video"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!caja) { console.log(`✗ ${v.nombre}: no encontré el botón de play`); fallas++; continue; }
  for (const type of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type, x: caja.x, y: caja.y, button: "left", clickCount: 1 });
  await esperar(6000);
  const a = await evaluar(`(() => { const v = document.querySelector('video'); return { t: v.currentTime, dur: v.duration, listo: v.readyState, error: v.error && v.error.code, ancho: v.videoWidth, pausado: v.paused, controles: v.controls }; })()`);
  // Casi al final: que el archivo completo se pueda leer, no solo el comienzo.
  await evaluar(`(() => { const v = document.querySelector('video'); v.currentTime = v.duration - 8; })()`);
  await esperar(5000);
  const b = await evaluar(`(() => { const v = document.querySelector('video'); return { t: v.currentTime, error: v.error && v.error.code, listo: v.readyState }; })()`);
  const bien = a && !a.error && a.t > 1 && a.ancho > 0 && !a.pausado && a.controles && b && !b.error && b.t > a.dur - 8.5 && b.listo >= 2;
  if (!bien) fallas++;
  console.log(`${bien ? "✓" : "✗"} ${v.nombre.padEnd(13)} reproduce ${a?.t?.toFixed(1)} s de ${Math.round(a?.dur ?? 0)} s · imagen ${a?.ancho}px · final ${b?.t?.toFixed(1)} s${a?.error || b?.error ? ` · ERROR ${a?.error ?? b?.error}` : ""}`);
}
ws.close();
chrome.kill();
console.log(fallas ? `\n✗ ${fallas} video(s) no reprodujeron bien.\n` : `\n✓ Los ${videos.length} videos reproducen de principio a fin.\n`);
process.exit(fallas ? 1 : 0);
