/**
 * Prueba de punta a punta del módulo de cenas: menú por reserva, guardado atómico de
 * elecciones (`save_meal_choices`), enlace público del peregrino y Excel por restaurante.
 *
 * OJO: corre contra la base de PRODUCCIÓN. Siembra un menú de prueba en la cena de
 * "Casa Camiño" del camino Sept/Oct-2026, elecciones y un opt-out, y borra todo al final
 * (también el `menu_token` que genera). No toca ninguna otra tabla.
 *
 *   npm run dev -- -p 3011
 *   node --env-file=.env.local scripts/probar-cenas.mjs
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import crypto from "node:crypto";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = "http://localhost:3011";
const DEP = "9c1a3bf2-072d-456e-9f69-096c5bb49268";

let fallos = 0;
const check = (ok, m) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };

// ── Sesión de equipo (para el RPC y las páginas internas) ────────────────────
const { data: profiles } = await admin.from("profiles").select("id, app_role").in("app_role", ["nico", "naty", "admin"]).limit(1);
const { data: userRes } = await admin.auth.admin.getUserById(profiles[0].id);
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: userRes.user.email });
const team = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess, error: otpErr } = await team.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
if (otpErr) throw otpErr;
const raw = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64");
const name = `sb-${REF}-auth-token`;
const chunks = [];
for (let i = 0; i < raw.length; i += 3180) chunks.push(raw.slice(i, i + 3180));
const cookie = chunks.length === 1 ? `${name}=${chunks[0]}` : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
console.log("Sesión de", userRes.user.email);

// ── Datos ────────────────────────────────────────────────────────────────────
// Se siembra en la primera cena del camino que NO tenga menú cargado (para no pisar datos
// reales); se prefiere Casa Camiño si está libre.
const { data: cenasCamino } = await admin.from("v_dinner_reservations").select("*").eq("departure_id", DEP).order("check_in");
const { data: conMenu } = await admin.from("reservation_menu_courses").select("reservation_id").in("reservation_id", (cenasCamino ?? []).map((c) => c.reservation_id));
const ocupadas = new Set((conMenu ?? []).map((c) => c.reservation_id));
const libres = (cenasCamino ?? []).filter((c) => !ocupadas.has(c.reservation_id));
const cena = libres.find((c) => /camiño/i.test(c.provider_name)) ?? libres[0];
if (!cena) throw new Error("Todas las cenas del camino ya tienen menú cargado; no siembro encima de datos reales.");
const { data: regs } = await admin.from("registrations").select("id, pilgrim_id, menu_token, pilgrims!inner(full_name, deleted_at)").eq("departure_id", DEP).neq("status", "cancelado");
const gente = regs.filter((r) => !r.pilgrims.deleted_at).map((r) => ({ reg: r.id, id: r.pilgrim_id, name: r.pilgrims.full_name, token: r.menu_token })).sort((a, b) => a.name.localeCompare(b.name, "es"));
console.log(`Cena: ${cena.provider_name} (${cena.check_in}) · ${gente.length} inscritos`);
const { count: menuPrevio } = await admin.from("reservation_menu_courses").select("id", { count: "exact", head: true }).eq("reservation_id", cena.reservation_id);
if (menuPrevio > 0) throw new Error("Esa cena ya tiene menú cargado; no siembro encima de datos reales.");
const REST = cena.provider_name;

// ── 1. Sembrar el menú ───────────────────────────────────────────────────────
console.log("\nMenú");
const { data: cursos } = await admin.from("reservation_menu_courses").insert([
  { reservation_id: cena.reservation_id, course: "entrada", position: 0, required: true },
  { reservation_id: cena.reservation_id, course: "fuerte", label: "Principal", position: 1, required: true },
  { reservation_id: cena.reservation_id, course: "postre", position: 2, required: true },
  { reservation_id: cena.reservation_id, course: "bebida", position: 3, required: false },
]).select("id, course");
const cE = cursos.find((c) => c.course === "entrada").id, cF = cursos.find((c) => c.course === "fuerte").id, cP = cursos.find((c) => c.course === "postre").id, cB = cursos.find((c) => c.course === "bebida").id;
const { data: platos } = await admin.from("reservation_menu_options").insert([
  { course_id: cE, name: "Caldo gallego", position: 0 }, { course_id: cE, name: "Ensalada mixta", position: 1 },
  { course_id: cF, name: "Pulpo á feira", position: 0 }, { course_id: cF, name: "Merluza a la gallega", position: 1 },
  { course_id: cP, name: "Tarta de Santiago", position: 0 },
  { course_id: cB, name: "Agua", position: 0 }, { course_id: cB, name: "Vino de la casa", position: 1 },
]).select("id, course_id, name");
const op = (n) => platos.find((p) => p.name === n).id;
check(cursos.length === 4 && platos.length === 7, "menú sembrado: 4 secciones, 7 platos");

const { error: malPlato } = await admin.from("meal_choices").insert({ reservation_id: cena.reservation_id, pilgrim_id: gente[0].id, course_id: cE, option_id: op("Pulpo á feira") });
check(malPlato && malPlato.message.includes("no pertenece"), `trigger: plato de otra sección → "${malPlato?.message}"`);

// Modos y condicionales: una sección fija (pan) y un "café" que solo aplica si eligió Tarta.
const { data: extra } = await admin.from("reservation_menu_courses").insert([
  { reservation_id: cena.reservation_id, course: "otro", label: "Pan", position: 4, required: false, mode: "fijo" },
  { reservation_id: cena.reservation_id, course: "otro", label: "Café", position: 5, required: false, mode: "peregrino" },
]).select("id, label");
const cPan = extra.find((x) => x.label === "Pan").id, cCafe = extra.find((x) => x.label === "Café").id;
const { data: extraOps } = await admin.from("reservation_menu_options").insert([
  { course_id: cPan, name: "Pan de la casa", position: 0 },
  { course_id: cCafe, name: "Solo", position: 0 }, { course_id: cCafe, name: "Con leche", position: 1 },
]).select("id, name");
const { error: depErr } = await admin.from("reservation_menu_courses").update({ depends_on_option_id: op("Tarta de Santiago") }).eq("id", cCafe);
check(!depErr, `el café depende de la tarta${depErr ? ` — ${depErr.message}` : ""}`);
const { error: depMal } = await admin.from("reservation_menu_courses").update({ depends_on_option_id: extraOps.find((o) => o.name === "Solo").id }).eq("id", cPan);
check(depMal && depMal.message.includes("antes"), `trigger: no puede depender de una sección posterior → "${depMal?.message}"`);
const { error: fijoErr } = await admin.from("meal_choices").insert({ reservation_id: cena.reservation_id, pilgrim_id: gente[0].id, course_id: cPan, option_id: extraOps.find((o) => o.name === "Pan de la casa").id });
check(fijoErr && fijoErr.message.includes("no la elige"), `trigger: no se elige en una sección fija → "${fijoErr?.message}"`);

// ── 2. Guardado por el RPC con sesión de equipo ──────────────────────────────
console.log("\nRPC save_meal_choices");
const rpc = (dinners) => team.rpc("save_meal_choices", { p_departure_id: DEP, p_dinners: dinners });
const [a, b, c] = gente;
const { data: r1, error: e1 } = await rpc([{
  reservation_id: cena.reservation_id,
  choices: [
    { pilgrim_id: a.id, course_id: cE, option_id: op("Caldo gallego") }, { pilgrim_id: a.id, course_id: cF, option_id: op("Pulpo á feira") }, { pilgrim_id: a.id, course_id: cP, option_id: op("Tarta de Santiago") },
    { pilgrim_id: b.id, course_id: cF, option_id: op("Merluza a la gallega") },
  ],
  opt_outs: [{ pilgrim_id: c.id, reason: "Prueba" }],
}]);
check(!e1 && r1?.elecciones === 4, `guarda 4 elecciones y 1 opt-out${e1 ? ` — ${e1.message}` : ` (${JSON.stringify(r1)})`}`);

const { error: e2 } = await rpc([{ reservation_id: cena.reservation_id, choices: [{ pilgrim_id: a.id, course_id: cF, option_id: op("Caldo gallego") }], opt_outs: [] }]);
check(e2 && e2.message.includes(REST) && e2.message.includes("ya no está en el menú"), `plato de otra sección → "${e2?.message}"`);
const { count: sigue } = await admin.from("meal_choices").select("id", { count: "exact", head: true }).eq("reservation_id", cena.reservation_id);
check(sigue === 4, `y nada cambió (${sigue} elecciones)`);

const { error: e3 } = await rpc([{ reservation_id: cena.reservation_id, choices: [{ pilgrim_id: c.id, course_id: cF, option_id: op("Pulpo á feira") }], opt_outs: [{ pilgrim_id: c.id }] }]);
check(e3 && e3.message.includes("no cena"), `elección + no cena del mismo → "${e3?.message}"`);

const { error: e4 } = await admin.from("reservation_opt_outs").insert({ reservation_id: cena.reservation_id, pilgrim_id: a.id, kind: "cena" });
check(e4 && e4.message.includes("ya eligió"), `trigger: no cena a quien ya eligió → "${e4?.message}"`);

// ── 3. Enlace público del peregrino ──────────────────────────────────────────
console.log("\nEnlace público");
const token = crypto.randomBytes(32).toString("hex");
const { error: tokErr } = await admin.from("registrations").update({ menu_token: token, menu_token_created_at: new Date().toISOString() }).eq("id", b.reg);
if (tokErr) throw tokErr;
const pub = await fetch(`${BASE}/menu/${token}`, { redirect: "manual" });
const html = await pub.text();
check(pub.status === 200, `GET /menu/<token> → ${pub.status} (sin sesión)`);
check(html.includes(b.name.split(" ")[0]) && html.includes(REST) && html.includes("Merluza a la gallega"), "muestra el nombre, el restaurante y el menú");
check(html.includes("No voy a cenar esta noche"), "tiene la casilla de no cenar");
check(pub.headers.get("referrer-policy") === "no-referrer" && (pub.headers.get("x-robots-tag") ?? "").includes("noindex"), "cabeceras no-referrer y noindex");
const falso = await fetch(`${BASE}/menu/${"0".repeat(64)}`, { redirect: "manual" });
check(falso.status === 404, `token inventado → ${falso.status}`);
const corto = await fetch(`${BASE}/menu/abc`, { redirect: "manual" });
check(corto.status === 404, `token corto → ${corto.status}`);

// ── 3b. Enlace único del camino ──────────────────────────────────────────────
console.log("\nEnlace del camino");
const tokenCamino = crypto.randomBytes(32).toString("hex");
const { data: depPrev } = await admin.from("departures").select("menu_token").eq("id", DEP).maybeSingle();
await admin.from("departures").update({ menu_token: tokenCamino, menu_token_created_at: new Date().toISOString() }).eq("id", DEP);
const lista = await fetch(`${BASE}/menu/c/${tokenCamino}`, { redirect: "manual" });
const listaHtml = await lista.text();
check(lista.status === 200 && listaHtml.includes("¿Quién eres?") && listaHtml.includes(b.name), `GET /menu/c/<token> → ${lista.status}, muestra la lista con ${b.name}`);
check(!listaHtml.includes("Merluza a la gallega"), "la lista no muestra lo que eligió nadie");
check(lista.headers.get("referrer-policy") === "no-referrer" && (lista.headers.get("x-robots-tag") ?? "").includes("noindex"), "cabeceras no-referrer y noindex en /menu/c");
const yo = await fetch(`${BASE}/menu/c/${tokenCamino}?yo=${b.reg}`, { redirect: "manual" });
const yoHtml = await yo.text();
check(yo.status === 200 && yoHtml.includes(b.name.split(" ")[0]) && yoHtml.includes(REST) && yoHtml.includes("No soy yo"), `?yo=<inscripción> → ${yo.status}, entra como ${b.name}`);
check(yoHtml.includes("Esto es lo que vamos a pedir") && yoHtml.includes("Enviar mi elección"), "el formulario termina con el resumen y el botón Enviar");
check(listaHtml.includes("POR ELEGIR") || listaHtml.includes("por elegir"), "la lista marca a quién le falta");
const { data: otraReg } = await admin.from("registrations").select("id").neq("departure_id", DEP).limit(1).maybeSingle();
if (otraReg) {
  const ajeno = await fetch(`${BASE}/menu/c/${tokenCamino}?yo=${otraReg.id}`, { redirect: "manual" });
  check(ajeno.status === 404, `una inscripción de otro camino → ${ajeno.status}`);
}
const yoFalso = await fetch(`${BASE}/menu/c/${tokenCamino}?yo=00000000-0000-0000-0000-000000000000`, { redirect: "manual" });
check(yoFalso.status === 404, `inscripción inventada → ${yoFalso.status}`);
const caminoFalso = await fetch(`${BASE}/menu/c/${"0".repeat(64)}`, { redirect: "manual" });
check(caminoFalso.status === 404, `token de camino inventado → ${caminoFalso.status}`);
const sinToken = await fetch(`${BASE}/menu/c`, { redirect: "manual" });
check(sinToken.status === 404, `/menu/c a secas → ${sinToken.status}`);

// Lo que eligió por su enlace se conserva cuando el equipo guarda sin tocarlo
await admin.from("meal_choices").update({ chosen_via: "peregrino" }).eq("reservation_id", cena.reservation_id).eq("pilgrim_id", b.id);
const { error: e5 } = await rpc([{
  reservation_id: cena.reservation_id,
  choices: [
    { pilgrim_id: a.id, course_id: cE, option_id: op("Caldo gallego") }, { pilgrim_id: a.id, course_id: cF, option_id: op("Pulpo á feira") }, { pilgrim_id: a.id, course_id: cP, option_id: op("Tarta de Santiago") },
    { pilgrim_id: b.id, course_id: cF, option_id: op("Merluza a la gallega") },
    { pilgrim_id: b.id, course_id: cP, option_id: op("Tarta de Santiago") },
  ],
  opt_outs: [{ pilgrim_id: c.id }],
}]);
const { data: deB } = await admin.from("meal_choices").select("course_id, chosen_via").eq("reservation_id", cena.reservation_id).eq("pilgrim_id", b.id);
check(!e5 && deB.find((x) => x.course_id === cF)?.chosen_via === "peregrino" && deB.find((x) => x.course_id === cP)?.chosen_via === "equipo", "el RPC conserva 'peregrino' en lo que no cambió y marca 'equipo' en lo nuevo");

// Condicional: b eligió Tarta → puede elegir café; si cambia a otro postre, el café se borra solo.
const { error: e6 } = await rpc([{
  reservation_id: cena.reservation_id,
  choices: [
    { pilgrim_id: a.id, course_id: cE, option_id: op("Caldo gallego") }, { pilgrim_id: a.id, course_id: cF, option_id: op("Pulpo á feira") }, { pilgrim_id: a.id, course_id: cP, option_id: op("Tarta de Santiago") },
    { pilgrim_id: b.id, course_id: cF, option_id: op("Merluza a la gallega") },
    { pilgrim_id: b.id, course_id: cP, option_id: op("Tarta de Santiago") },
    { pilgrim_id: b.id, course_id: cCafe, option_id: extraOps.find((o) => o.name === "Con leche").id },
  ],
  opt_outs: [{ pilgrim_id: c.id }],
}]);
const { count: cafeB } = await admin.from("meal_choices").select("id", { count: "exact", head: true }).eq("reservation_id", cena.reservation_id).eq("pilgrim_id", b.id).eq("course_id", cCafe);
check(!e6 && cafeB === 1, `con tarta, el café se guarda${e6 ? ` — ${e6.message}` : ""}`);
const { error: e7 } = await rpc([{
  reservation_id: cena.reservation_id,
  choices: [
    { pilgrim_id: a.id, course_id: cE, option_id: op("Caldo gallego") }, { pilgrim_id: a.id, course_id: cF, option_id: op("Pulpo á feira") }, { pilgrim_id: a.id, course_id: cP, option_id: op("Tarta de Santiago") },
    { pilgrim_id: b.id, course_id: cF, option_id: op("Merluza a la gallega") },
    { pilgrim_id: b.id, course_id: cCafe, option_id: extraOps.find((o) => o.name === "Con leche").id },
  ],
  opt_outs: [{ pilgrim_id: c.id }],
}]);
const { count: cafeB2 } = await admin.from("meal_choices").select("id", { count: "exact", head: true }).eq("reservation_id", cena.reservation_id).eq("pilgrim_id", b.id).eq("course_id", cCafe);
check(!e7 && cafeB2 === 0, `sin tarta, el RPC borra el café huérfano${e7 ? ` — ${e7.message}` : ""}`);
// Vuelve a dejar la tarta de b para lo que sigue (Excel espera 2 tartas).
await rpc([{
  reservation_id: cena.reservation_id,
  choices: [
    { pilgrim_id: a.id, course_id: cE, option_id: op("Caldo gallego") }, { pilgrim_id: a.id, course_id: cF, option_id: op("Pulpo á feira") }, { pilgrim_id: a.id, course_id: cP, option_id: op("Tarta de Santiago") },
    { pilgrim_id: b.id, course_id: cF, option_id: op("Merluza a la gallega") },
    { pilgrim_id: b.id, course_id: cP, option_id: op("Tarta de Santiago") },
  ],
  opt_outs: [{ pilgrim_id: c.id }],
}]);

// ── 4. Pestaña interna y Excel ───────────────────────────────────────────────
console.log("\nPestaña Cenas y Excel");
const tab = await fetch(`${BASE}/caminos/${DEP}?tab=cenas`, { headers: { cookie }, redirect: "manual" });
const tabHtml = await tab.text();
check(tab.status === 200 && tabHtml.includes("Pulpo á feira") && tabHtml.includes("por su cuenta"), "la pestaña muestra el menú y el chip 'por su cuenta'");
check(!/Application error|Unhandled Runtime Error/.test(tabHtml), "sin errores en el HTML");

async function bajar(ruta) {
  const res = await fetch(`${BASE}${ruta}`, { headers: { cookie }, redirect: "manual" });
  console.log(`  ${ruta} → ${res.status} · ${res.headers.get("content-disposition")}`);
  if (res.status !== 200) { fallos++; return null; }
  return XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
}
const wb = await bajar(`/api/export/caminos/${DEP}/cenas`);
if (wb) {
  console.log("  hojas:", wb.SheetNames.join(" | "));
  const resumen = XLSX.utils.sheet_to_json(wb.Sheets["Resumen"]);
  const fila = resumen.find((r) => r["Restaurante"] === REST);
  // Solo a. eligió en todas las obligatorias (b. no eligió entrada), así que "eligieron" es 1.
  check(fila && fila["Menú cargado"] === "Sí" && fila["Eligieron"] === 1 && fila["Pendientes"] === 13 && fila["No cenan"] === 1, `Resumen: eligieron ${fila?.["Eligieron"]}, pendientes ${fila?.["Pendientes"]}, no cenan ${fila?.["No cenan"]}`);
  check(resumen.some((r) => r["Menú cargado"] === "No"), "las cenas sin menú también salen en el Resumen");
  const hoja = wb.Sheets[wb.SheetNames.find((n) => n.startsWith(REST.slice(0, 9)))];
  const aoa = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false });
  const iCab = aoa.findIndex((f) => f[0] === "Peregrino");
  check(iCab > 0 && aoa[iCab].join("|") === "Peregrino|Entrada|Principal|Postre|Bebida|Pan (todos)|Café|Alimentación|Notas", `cabecera: ${aoa[iCab]?.join(" | ")}`);
  check(aoa.some((f) => String(f[0]).startsWith("Igual para todos: Pan: Pan de la casa")), "la hoja dice qué va igual para todos");
  const filaA = aoa.find((f) => f[0] === a.name);
  check(filaA && filaA[1] === "Caldo gallego" && filaA[2] === "Pulpo á feira" && filaA[3] === "Tarta de Santiago" && filaA[5] === "Pan de la casa", `fila de ${a.name}: ${JSON.stringify(filaA)}`);
  const filaSinTarta = aoa.find((f) => f[0] !== a.name && f[0] !== b.name && f[2] === "— sin elegir —");
  check(filaSinTarta && filaSinTarta[6] === "—", `el café de quien no eligió tarta sale como "—": ${JSON.stringify(filaSinTarta)}`);
  const pendientes = aoa.filter((f) => f[2] === "— sin elegir —").length;
  check(pendientes === gente.length - 3, `${pendientes} pendientes marcados "— sin elegir —"`);
  check(aoa.some((f) => f[0] === "No cenan" && String(f[1]).includes(c.name)), `"No cenan: ${c.name}"`);
  const iRes = aoa.findIndex((f) => f[0] === "Resumen por plato");
  const conteo = aoa.slice(iRes + 2).filter((f) => f.length === 3 && typeof f[2] === "number");
  check(conteo.some((f) => f[1] === "Tarta de Santiago" && f[2] === 2) && conteo.some((f) => f[1] === "Pulpo á feira" && f[2] === 1), `resumen por plato: ${conteo.map((f) => `${f[1]}=${f[2]}`).join(", ")}`);
  check(conteo.some((f) => f[1] === "Pan de la casa (todos)" && f[2] === gente.length - 1), `el pan fijo va para los ${gente.length - 1} que cenan`);
  const matriz = XLSX.utils.sheet_to_json(wb.Sheets["Matriz por peregrino"]);
  const col = Object.keys(matriz[0]).find((k) => k.includes(REST));
  check(matriz.find((m) => m["Peregrino"] === c.name)?.[col] === "no cena" && matriz.find((m) => m["Peregrino"] === a.name)?.[col] === "Caldo gallego / Pulpo á feira / Tarta de Santiago", "matriz por peregrino");
}
const solo = await bajar(`/api/export/caminos/${DEP}/cenas?restaurante=${cena.provider_id}`);
if (solo) check(solo.SheetNames.length === 1, `el export de un solo restaurante trae 1 pestaña: ${solo.SheetNames.join(",")}`);

// ── 5. Limpieza ──────────────────────────────────────────────────────────────
console.log("\nLimpieza");
await admin.from("reservation_opt_outs").delete().eq("reservation_id", cena.reservation_id).eq("kind", "cena");
const { error: delMenu } = await admin.from("reservation_menu_courses").delete().eq("reservation_id", cena.reservation_id);
if (delMenu) throw delMenu;
await admin.from("registrations").update({ menu_token: b.token ?? null, menu_token_created_at: null }).eq("id", b.reg);
await admin.from("departures").update({ menu_token: depPrev?.menu_token ?? null }).eq("id", DEP);
const { count: quedanCh } = await admin.from("meal_choices").select("id", { count: "exact", head: true }).eq("reservation_id", cena.reservation_id);
const { count: quedanOp } = await admin.from("reservation_menu_options").select("id", { count: "exact", head: true }).in("course_id", cursos.map((x) => x.id));
check(quedanCh === 0 && quedanOp === 0, "borrar el menú borró en cascada platos y elecciones");
console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
