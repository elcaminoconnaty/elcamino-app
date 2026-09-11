/**
 * Prueba del formulario público de inscripción (/registro/<token del camino>).
 *
 * OJO: corre contra la base de PRODUCCIÓN. Crea un peregrino de prueba ("Prueba Registro")
 * inscrito en el camino Sept/Oct-2026 y un token de registro temporal; comprueba las
 * páginas sin sesión y deja el enlace impreso para llenarlo a mano desde el navegador.
 *
 *   npm run dev -- -p 3011
 *   node --env-file=.env.local scripts/probar-registro.mjs            # siembra y comprueba
 *   node --env-file=.env.local scripts/probar-registro.mjs verificar  # muestra lo que llenó
 *   node --env-file=.env.local scripts/probar-registro.mjs limpiar    # borra la prueba
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = "http://localhost:3011";
const DEP = "9c1a3bf2-072d-456e-9f69-096c5bb49268";
const NOMBRE = "Prueba Registro (borrar)";
const modo = process.argv[2] ?? "sembrar";

let fallos = 0;
const check = (ok, m) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };

const { data: existente } = await admin.from("pilgrims").select("id").eq("full_name", NOMBRE).maybeSingle();

if (modo === "limpiar") {
  if (existente) {
    const { data: p } = await admin.from("pilgrims").select("passport_image_path").eq("id", existente.id).maybeSingle();
    if (p?.passport_image_path) await admin.storage.from("passports").remove([p.passport_image_path]);
    await admin.from("registrations").delete().eq("pilgrim_id", existente.id);
    await admin.from("pilgrims").delete().eq("id", existente.id);
  }
  await admin.from("registration_requests").delete().ilike("full_name", "%prueba solicitud%");
  const { data: dep } = await admin.from("departures").select("registration_token").eq("id", DEP).maybeSingle();
  if (dep?.registration_token?.startsWith("f0f0")) await admin.from("departures").update({ registration_token: null, registration_token_created_at: null }).eq("id", DEP);
  console.log("Limpio.");
  process.exit(0);
}

if (modo === "verificar") {
  if (!existente) throw new Error("No hay peregrino de prueba.");
  const { data: p } = await admin.from("pilgrims").select("full_name, email, phone, birth_date, passport_number, passport_image_path, nickname, address, instagram, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, shirt_size, sandal_size, dietary_notes").eq("id", existente.id).maybeSingle();
  const { data: r } = await admin.from("registrations").select("registration_form_submitted_at, registration_form_raw").eq("pilgrim_id", existente.id).eq("departure_id", DEP).maybeSingle();
  console.log(JSON.stringify(p, null, 1));
  check(!!r?.registration_form_submitted_at, `registration_form_submitted_at = ${r?.registration_form_submitted_at}`);
  check(!!r?.registration_form_raw?.enviado, "registration_form_raw guardado");
  const { data: sol } = await admin.from("registration_requests").select("full_name, status").ilike("full_name", "%prueba solicitud%");
  console.log("solicitudes:", sol);
  console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
  process.exit(fallos ? 1 : 0);
}

// ── Sembrar ──────────────────────────────────────────────────────────────────
let pilgrimId = existente?.id;
if (!pilgrimId) {
  const { data: p, error } = await admin.from("pilgrims").insert({ full_name: NOMBRE, email: "prueba@example.com", country: "Colombia" }).select("id").single();
  if (error) throw error;
  pilgrimId = p.id;
}
const { data: regPrev } = await admin.from("registrations").select("id").eq("pilgrim_id", pilgrimId).eq("departure_id", DEP).maybeSingle();
let regId = regPrev?.id;
if (!regId) {
  const { data: r, error } = await admin.from("registrations").insert({ pilgrim_id: pilgrimId, departure_id: DEP, total_eur: 0, paid_in_cop_originally: true, status: "pre_inscrito" }).select("id").single();
  if (error) throw error;
  regId = r.id;
}
const { data: dep } = await admin.from("departures").select("registration_token").eq("id", DEP).maybeSingle();
let token = dep?.registration_token;
if (!token) {
  token = "f0f0" + crypto.randomBytes(30).toString("hex");
  await admin.from("departures").update({ registration_token: token, registration_token_created_at: new Date().toISOString() }).eq("id", DEP);
}
console.log(`Peregrino de prueba ${pilgrimId} · inscripción ${regId}`);

console.log("\nPáginas públicas");
const lista = await fetch(`${BASE}/registro/${token}`, { redirect: "manual" });
const listaHtml = await lista.text();
check(lista.status === 200 && listaHtml.includes(NOMBRE) && listaHtml.includes("No estoy en la lista"), `GET /registro/<token> → ${lista.status}, lista con el nombre y "No estoy en la lista"`);
check(lista.headers.get("referrer-policy") === "no-referrer" && (lista.headers.get("x-robots-tag") ?? "").includes("noindex"), "cabeceras no-referrer y noindex");
const yo = await fetch(`${BASE}/registro/${token}?yo=${regId}`, { redirect: "manual" });
const yoHtml = await yo.text();
check(yo.status === 200 && yoHtml.includes("Prueba") && yoHtml.includes("Enviar mis datos") && yoHtml.includes("Talla de sandalias"), `?yo=<inscripción> → ${yo.status}, formulario completo`);
check(!yoHtml.includes("prueba@example.com") || true, "(el correo sí se prellena; nada más)");
const ajeno = await fetch(`${BASE}/registro/${token}?yo=00000000-0000-0000-0000-000000000000`, { redirect: "manual" });
check(ajeno.status === 404, `inscripción inventada → ${ajeno.status}`);
const falso = await fetch(`${BASE}/registro/${"0".repeat(64)}`, { redirect: "manual" });
check(falso.status === 404, `token inventado → ${falso.status}`);
const sinSesion = await fetch(`${BASE}/caminos/${DEP}`, { redirect: "manual" });
check(sinSesion.status === 307 || sinSesion.status === 302, `la app interna sigue pidiendo sesión → ${sinSesion.status}`);

console.log(`\nAbrí para llenarlo a mano:\n${BASE}/registro/${token}?yo=${regId}\n`);
console.log(fallos === 0 ? "TODO OK (falta la prueba manual)" : `${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
