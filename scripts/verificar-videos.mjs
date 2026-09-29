/**
 * Verifica, contra PRODUCCIÓN, que cada video de un camino le llegue bien a su dueño.
 * Solo lee: no marca envíos ni suma vistas (abre las páginas con ?vista=equipo).
 *
 *   node --env-file=.env.local scripts/verificar-videos.mjs "<nombre del camino>" [<carpeta con los originales>]
 *
 * Por cada peregrino comprueba: celular usable para WhatsApp, página 200 con SU nombre, que
 * nadie cachee la página, que el archivo del bucket sea byte a byte el original (inicio, medio
 * y final, y el tamaño), que responda por rangos (lo exige el iPhone), que sin firma no se
 * pueda bajar, y que "Guardar mi video" baje el archivo con nombre. Termina en rojo si algo falla.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://elcamino-app-production.up.railway.app";
const [camino, carpeta] = process.argv.slice(2);
if (!camino) { console.error('Uso: verificar-videos.mjs "<camino>" [carpeta]'); process.exit(1); }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: dep } = await db.from("departures").select("id, name").eq("name", camino).single();
const { data: filas } = await db
  .from("pilgrim_videos")
  .select("id, token, nombre, original_name, size_bytes, storage_key, sent_at, view_count, registrations!inner(departure_id, status, pilgrims:pilgrim_id(full_name, phone, deleted_at))")
  .eq("registrations.departure_id", dep.id);

// La misma regla que usa el botón de WhatsApp (components/pilgrims/pasos-bienvenida.tsx).
function numeroWhatsApp(telefono) {
  const crudo = (telefono ?? "").trim();
  const digitos = crudo.replace(/\D/g, "");
  if (!crudo.startsWith("+") && /^3\d{9}$/.test(digitos)) return `57${digitos}`;
  if (crudo.startsWith("+") && digitos.length >= 8) return digitos;
  if (/^573\d{9}$/.test(digitos)) return digitos;
  return null;
}

const desescapar = (s) => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
async function rango(url, desde, hasta) {
  const r = await fetch(url, { headers: { Range: `bytes=${desde}-${hasta}` } });
  return { status: r.status, tipo: r.headers.get("content-type"), total: Number((r.headers.get("content-range") ?? "").split("/")[1]), cuerpo: Buffer.from(await r.arrayBuffer()), disp: r.headers.get("content-disposition") };
}
function trozoLocal(archivo, desde, largo) {
  const fd = fs.openSync(archivo, "r");
  const b = Buffer.alloc(largo);
  fs.readSync(fd, b, 0, largo, desde);
  fs.closeSync(fd);
  return b;
}

let fallas = 0;
const tokens = new Set();
console.log(`\n${dep.name} · ${filas.length} videos\n`);

for (const v of filas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))) {
  const p = v.registrations.pilgrims;
  const errores = [];
  const ok = (cond, msj) => { if (!cond) errores.push(msj); };

  ok(!tokens.has(v.token), "token repetido"); tokens.add(v.token);
  ok(v.registrations.status !== "cancelado" && !p.deleted_at, "inscripción cancelada o peregrino borrado");
  const wa = numeroWhatsApp(p.phone);
  ok(wa, `celular no usable para WhatsApp: "${p.phone}"`);

  // 1. La página
  const pagina = await fetch(`${BASE}/video/${v.token}?vista=equipo`, { redirect: "manual" });
  const html = (await pagina.text()).replace(/<!-- -->/g, "");
  ok(pagina.status === 200, `página respondió ${pagina.status}`);
  ok(html.includes(`Para ti, ${v.nombre}`), `la página no dice "Para ti, ${v.nombre}"`);
  ok(html.includes(dep.name.toUpperCase()), "la página no muestra el camino");
  const cache = pagina.headers.get("cache-control") ?? "";
  ok(/no-store|private|no-cache|max-age=0/.test(cache), `la página se podría cachear (cache-control: ${cache})`);
  ok(/noindex/.test(pagina.headers.get("x-robots-tag") ?? ""), "falta noindex");
  ok((pagina.headers.get("referrer-policy") ?? "") === "no-referrer", "falta no-referrer");
  // La vista previa de WhatsApp y el enlace que arma la pestaña salen de NEXT_PUBLIC_APP_URL:
  // si og:image apunta al dominio de producción, esa variable está bien en Railway.
  ok(new RegExp(`og:image" content="${BASE}/`).test(html), "og:image no apunta a producción (revisar NEXT_PUBLIC_APP_URL en Railway)");
  const src = desescapar((html.match(/<video[^>]*src="([^"]+)"/) ?? [])[1] ?? "");
  ok(src.includes(v.storage_key), "el video de la página no es el suyo");

  // 2. El archivo: rangos, tamaño y bytes contra el original
  if (src) {
    const ini = await rango(src, 0, 1_048_575);
    ok(ini.status === 206, `sin respuesta por rangos (${ini.status})`);
    ok(ini.tipo === "video/mp4", `tipo ${ini.tipo}`);
    ok(ini.total === Number(v.size_bytes), `tamaño en el bucket ${ini.total} ≠ ${v.size_bytes}`);
    const medio = Math.floor(ini.total / 2);
    const mid = await rango(src, medio, medio + 262_143);
    const fin = await rango(src, ini.total - 1_048_576, ini.total - 1);
    const original = carpeta ? path.join(carpeta, v.original_name) : null;
    if (original && fs.existsSync(original)) {
      ok(fs.statSync(original).size === ini.total, "el tamaño no coincide con el archivo original");
      ok(ini.cuerpo.equals(trozoLocal(original, 0, 1_048_576)), "el inicio no coincide con el original");
      ok(mid.cuerpo.equals(trozoLocal(original, medio, 262_144)), "el medio no coincide con el original");
      ok(fin.cuerpo.equals(trozoLocal(original, ini.total - 1_048_576, 1_048_576)), "el final no coincide con el original");
    } else if (carpeta) errores.push(`no encontré el original ${v.original_name}`);
    const sinFirma = await fetch(src.split("?")[0], { headers: { Range: "bytes=0-0" } });
    ok(sinFirma.status === 403 || sinFirma.status === 401, `¡se puede bajar sin firma! (${sinFirma.status})`);
  }

  // 3. "Guardar mi video"
  const desc = await fetch(`${BASE}/video/${v.token}/descargar`, { redirect: "manual" });
  ok(desc.status === 302, `descargar respondió ${desc.status}`);
  if (desc.status === 302) {
    const d = await rango(desc.headers.get("location"), 0, 0);
    ok(d.status === 206, `la descarga no baja (${d.status})`);
    ok(/attachment/.test(d.disp ?? ""), "la descarga no viene como archivo");
  }

  const estado = errores.length ? "✗" : "✓";
  console.log(`${estado} ${v.nombre.padEnd(13)} ${p.full_name.padEnd(34)} wa.me/${wa ?? "—"}  ${(v.size_bytes / 1e6).toFixed(0)} MB${v.sent_at ? " · ya enviado" : ""}${v.view_count ? ` · ${v.view_count} vistas` : ""}`);
  for (const e of errores) console.log(`    · ${e}`);
  fallas += errores.length;
}

// 4. Un enlace inventado no abre nada
const falso = await fetch(`${BASE}/video/${"a".repeat(64)}`, { redirect: "manual" });
console.log(`\n${falso.status === 404 ? "✓" : "✗"} un enlace inventado da ${falso.status}`);
if (falso.status !== 404) fallas++;

console.log(fallas ? `\n✗ ${fallas} problema(s). NO enviar hasta arreglarlos.\n` : `\n✓ Todo en orden: los ${filas.length} videos están listos para enviar.\n`);
process.exit(fallas ? 1 : 0);
