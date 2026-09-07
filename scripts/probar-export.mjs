/**
 * Prueba de punta a punta de los dos exports de camino.
 *
 * OJO: corre contra la base de PRODUCCIÓN. Siembra una distribución de prueba en
 * `room_assignments`, baja los dos Excel por HTTP con una sesión real de equipo,
 * verifica el contenido y borra lo sembrado al final. No toca ninguna otra tabla.
 *
 *   npm run dev -- -p 3011
 *   node --env-file=.env.local scripts/probar-export.mjs
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import fs from "node:fs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = "http://localhost:3011";
const DEP = "9c1a3bf2-072d-456e-9f69-096c5bb49268";

// ── 1. Sesión de un miembro del equipo ────────────────────────────────────────
const { data: profiles } = await admin.from("profiles").select("id, app_role").in("app_role", ["nico", "naty", "admin"]).limit(1);
const { data: userRes } = await admin.auth.admin.getUserById(profiles[0].id);
const email = userRes.user.email;
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (linkErr) throw linkErr;

const anon = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess, error: otpErr } = await anon.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
if (otpErr) throw otpErr;
console.log("Sesión de", email, "(", profiles[0].app_role, ")");

// @supabase/ssr guarda la sesión como base64- y la parte en trozos de 3180 chars
const raw = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64");
const name = `sb-${REF}-auth-token`;
const chunks = [];
for (let i = 0; i < raw.length; i += 3180) chunks.push(raw.slice(i, i + 3180));
const cookie = chunks.length === 1
  ? `${name}=${chunks[0]}`
  : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");

// ── 2. Sembrar una distribución de prueba ────────────────────────────────────
const { data: reservas } = await admin.from("reservations").select("id, check_in, providers(name)").eq("departure_id", DEP).eq("type", "alojamiento").order("check_in");
const { data: regs } = await admin.from("registrations").select("pilgrim_id, pilgrims(full_name)").eq("departure_id", DEP).neq("status", "cancelado");
const peregrinos = regs.map((r) => ({ id: r.pilgrim_id, name: r.pilgrims.full_name })).sort((a, b) => a.name.localeCompare(b.name, "es"));

const objetivo = reservas[1]; // Pensión Portomiño
const { data: rooms } = await admin.from("reservation_rooms").select("*").eq("reservation_id", objetivo.id).order("position");

const slots = [];
for (const r of rooms) for (let i = 1; i <= r.rooms_count; i++) slots.push({ id: r.id, idx: i, cap: r.capacity_per_room, tipo: r.room_type });

const sembradas = [];
let k = 0;
for (const s of slots) {
  for (let c = 0; c < s.cap && k < peregrinos.length; c++, k++) {
    sembradas.push({ reservation_id: objetivo.id, reservation_room_id: s.id, room_index: s.idx, pilgrim_id: peregrinos[k].id });
  }
  if (k >= peregrinos.length) break;
}
const { error: insErr } = await admin.from("room_assignments").insert(sembradas);
if (insErr) throw insErr;
console.log(`Sembradas ${sembradas.length} asignaciones en "${objetivo.providers.name}" (${objetivo.check_in})`);

// ── 3. Bajar y verificar los dos Excel ───────────────────────────────────────
let fallos = 0;
function check(ok, msg) { console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`); if (!ok) fallos++; }

async function bajar(ruta, archivo) {
  const res = await fetch(`${BASE}${ruta}`, { headers: { cookie }, redirect: "manual" });
  console.log(`\n${ruta} → ${res.status} ${res.headers.get("content-type")}`);
  if (res.status !== 200) { console.log((await res.text()).slice(0, 400)); fallos++; return null; }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(archivo, buf);
  console.log(`  ${res.headers.get("content-disposition")} · ${buf.length} bytes`);
  return XLSX.read(buf, { type: "buffer" });
}

const wbH = await bajar(`/api/export/caminos/${DEP}/habitaciones`, "/tmp/hab.xlsx");
if (wbH) {
  console.log("  hojas:", wbH.SheetNames.join(" | "));
  const dist = XLSX.utils.sheet_to_json(wbH.Sheets["Distribución"]);
  const conNombre = dist.filter((r) => r["Peregrino"] !== "— libre —");
  check(dist.length > 0, `hoja Distribución con ${dist.length} filas (camas)`);
  check(conNombre.length === sembradas.length, `${conNombre.length} camas ocupadas (esperadas ${sembradas.length})`);

  const nombresExcel = new Set(conNombre.map((r) => r["Peregrino"]));
  const nombresSeed = new Set(sembradas.map((s) => peregrinos.find((p) => p.id === s.pilgrim_id).name));
  check([...nombresSeed].every((n) => nombresExcel.has(n)), "todos los sembrados aparecen con su nombre");

  const noche = XLSX.utils.sheet_to_json(wbH.Sheets["Resumen por noche"]).find((r) => r["Hospedaje"] === objetivo.providers.name);
  check(noche && noche["Personas asignadas"] === sembradas.length, `resumen por noche: ${noche?.["Personas asignadas"]} personas, desglose "${noche?.["Desglose en uso"]}"`);
  check(noche && noche["Plazas libres"] === noche["Plazas"] - noche["Personas asignadas"], `plazas libres cuadran (${noche?.["Plazas"]} - ${noche?.["Personas asignadas"]} = ${noche?.["Plazas libres"]})`);

  const matriz = XLSX.utils.sheet_to_json(wbH.Sheets["Matriz por peregrino"]);
  check(matriz.length === sembradas.length, `matriz con ${matriz.length} peregrinos`);
  console.log("  ejemplo matriz:", JSON.stringify(matriz[0]));
  console.log("  ejemplo distribución:", JSON.stringify(conNombre[0]));
}

const wbP = await bajar(`/api/export/caminos/${DEP}/peregrinos`, "/tmp/per.xlsx");
if (wbP) {
  console.log("  hojas:", wbP.SheetNames.join(" | "));
  const per = XLSX.utils.sheet_to_json(wbP.Sheets["Peregrinos"]);
  check(per.length === peregrinos.length, `${per.length} peregrinos (esperados ${peregrinos.length})`);
  const cols = Object.keys(per[0] ?? {});
  for (const c of ["Nombre completo", "Teléfono", "Correo", "Contacto de emergencia", "Teléfono de emergencia", "N° pasaporte"]) {
    check(cols.includes(c), `columna "${c}"`);
  }
  const faltantes = XLSX.utils.sheet_to_json(wbP.Sheets["Datos por completar"]);
  console.log(`  ${faltantes.length} peregrinos con datos incompletos; ej:`, JSON.stringify(faltantes[0]));
}

// ── 4. Borrar lo sembrado ────────────────────────────────────────────────────
const { error: delErr, count } = await admin.from("room_assignments").delete({ count: "exact" }).eq("reservation_id", objetivo.id);
if (delErr) throw delErr;
const { count: quedan } = await admin.from("room_assignments").select("id", { count: "exact", head: true });
console.log(`\nLimpieza: borradas ${count}; quedan ${quedan} asignaciones en la BD.`);
console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
