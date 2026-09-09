/**
 * Prueba del guardado atómico del rooming list (`save_rooming_board`) y de las guardas
 * de "no duerme acá" en la base.
 *
 * OJO: corre contra la base de PRODUCCIÓN con una sesión real de equipo. Escribe en
 * `room_assignments` y `reservation_opt_outs` de las dos noches del Araguaney del camino
 * Sept/Oct-2026 y las deja vacías al final. No toca ninguna otra tabla.
 *
 *   node --env-file=.env.local scripts/probar-guardado-rooming.mjs
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const DEP = "9c1a3bf2-072d-456e-9f69-096c5bb49268";

let fallos = 0;
const check = (ok, m) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };

// ── Sesión de un miembro del equipo (el RPC exige is_team_member()) ──────────
const { data: profiles } = await admin.from("profiles").select("id, app_role").in("app_role", ["nico", "naty", "admin"]).limit(1);
const { data: userRes } = await admin.auth.admin.getUserById(profiles[0].id);
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: userRes.user.email });
if (linkErr) throw linkErr;
const team = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: otpErr } = await team.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
if (otpErr) throw otpErr;
console.log("Sesión de", userRes.user.email, "(", profiles[0].app_role, ")");

// ── Datos: las dos noches del Araguaney y los inscritos ──────────────────────
const { data: noches } = await admin
  .from("reservations")
  .select("id, check_in, providers!inner(name)")
  .eq("departure_id", DEP).eq("type", "alojamiento").ilike("providers.name", "%araguaney%")
  .order("check_in");
if (!noches || noches.length < 2) throw new Error("No encontré las dos noches del Araguaney");
const [noche1, noche2] = noches;
const { data: regs } = await admin.from("registrations").select("pilgrim_id, pilgrims!inner(full_name, deleted_at)").eq("departure_id", DEP).neq("status", "cancelado");
const gente = regs.filter((r) => !r.pilgrims.deleted_at).map((r) => ({ id: r.pilgrim_id, name: r.pilgrims.full_name })).sort((a, b) => a.name.localeCompare(b.name, "es"));
console.log(`${gente.length} inscritos · noche 1 ${noche1.check_in} · noche 2 ${noche2.check_in}`);

async function slotsDe(reservationId) {
  const { data: rooms } = await admin.from("reservation_rooms").select("id, rooms_count, capacity_per_room, position").eq("reservation_id", reservationId).order("position");
  const out = [];
  for (const r of rooms) for (let i = 1; i <= r.rooms_count; i++) out.push({ id: r.id, idx: i, cap: r.capacity_per_room });
  return out;
}
function repartir(ids, slots) {
  const out = [];
  let k = 0;
  for (const s of slots) for (let c = 0; c < s.cap && k < ids.length; c++, k++) out.push({ reservation_room_id: s.id, room_index: s.idx, pilgrim_id: ids[k] });
  return { assignments: out, sinCupo: ids.slice(k) };
}
async function estado() {
  const ids = [noche1.id, noche2.id];
  const { count: camas } = await admin.from("room_assignments").select("id", { count: "exact", head: true }).in("reservation_id", ids);
  const { count: opts } = await admin.from("reservation_opt_outs").select("id", { count: "exact", head: true }).in("reservation_id", ids);
  return { camas: camas ?? 0, opts: opts ?? 0 };
}
const rpc = (cliente, nights) => cliente.rpc("save_rooming_board", { p_departure_id: DEP, p_nights: nights });

const slots1 = await slotsDe(noche1.id);
const slots2 = await slotsDe(noche2.id);
const plazas2 = slots2.reduce((s, x) => s + x.cap, 0);
const antes = await estado();
console.log(`Estado inicial: ${antes.camas} camas, ${antes.opts} opt-outs en las dos noches`);

// ── 1. Sin sesión de equipo no se puede ──────────────────────────────────────
console.log("\nPermisos");
const { error: noAuth } = await rpc(admin, []);
check(noAuth && /No autorizado/.test(noAuth.message), `con la llave de servicio responde "No autorizado" (${noAuth?.message})`);

// ── 2. El caso real: todos la noche 1, la pareja no duerme la noche 2 ────────
console.log("\nCaso real del Araguaney");
const todos = repartir(gente.map((p) => p.id), slots1);
check(todos.sinCupo.length === 0, `noche 1: los ${gente.length} entran (${slots1.reduce((s, x) => s + x.cap, 0)} plazas)`);
const pareja = gente.slice(-2).map((p) => p.id);
const resto = gente.slice(0, -2).map((p) => p.id);
const trece = repartir(resto, slots2);
check(trece.sinCupo.length === 0, `noche 2: ${resto.length} entran en ${plazas2} plazas`);

const { data: r2, error: e2 } = await rpc(team, [
  { reservation_id: noche1.id, assignments: todos.assignments, opt_outs: [] },
  { reservation_id: noche2.id, assignments: trece.assignments, opt_outs: pareja.map((pilgrim_id) => ({ pilgrim_id, reason: "Se van antes" })) },
]);
check(!e2, `guarda las dos noches${e2 ? ` — ${e2.message}` : ""}`);
check(r2?.noches === 2 && r2?.asignaciones === gente.length + resto.length, `devuelve ${JSON.stringify(r2)}`);
let ahora = await estado();
check(ahora.camas === gente.length + resto.length && ahora.opts === 2, `en la base: ${ahora.camas} camas y ${ahora.opts} opt-outs`);
const { data: optRows } = await admin.from("reservation_opt_outs").select("pilgrim_id, kind, reason, created_by").eq("reservation_id", noche2.id);
check(optRows.every((o) => o.kind === "hospedaje" && o.reason === "Se van antes" && o.created_by === profiles[0].id), "los opt-outs quedan con kind, motivo y quién los marcó");

// ── 3. Atomicidad: una noche buena y una mala no cambian nada ────────────────
console.log("\nAtomicidad");
const previo = await estado();
const { error: e3 } = await rpc(team, [
  { reservation_id: noche1.id, assignments: [], opt_outs: [] }, // válida: vaciaría la noche 1
  { reservation_id: noche2.id, assignments: [{ reservation_room_id: slots2[0].id, room_index: 99, pilgrim_id: resto[0] }], opt_outs: [] },
]);
check(e3 && e3.message.includes("Araguaney") && e3.message.includes("ya no existe"), `habitación inexistente → "${e3?.message}"`);
ahora = await estado();
check(ahora.camas === previo.camas && ahora.opts === previo.opts, `nada cambió (${ahora.camas} camas, ${ahora.opts} opt-outs)`);

const { error: e4 } = await rpc(team, [
  { reservation_id: noche2.id, assignments: trece.assignments, opt_outs: [{ pilgrim_id: resto[0] }] },
]);
check(e4 && e4.message.includes("no duerme acá"), `cama + no duerme del mismo peregrino → "${e4?.message}"`);

const { error: e5 } = await rpc(team, [
  { reservation_id: noche2.id, assignments: [...trece.assignments, { ...trece.assignments[0], room_index: trece.assignments[0].room_index === 1 ? 2 : 1 }], opt_outs: [] },
]);
check(e5 && e5.message.includes("dos habitaciones"), `mismo peregrino en dos camas → "${e5?.message}"`);

const { data: otroCamino } = await admin.from("reservations").select("id").neq("departure_id", DEP).eq("type", "alojamiento").limit(1).maybeSingle();
if (otroCamino) {
  const { error: e6 } = await rpc(team, [{ reservation_id: otroCamino.id, assignments: [], opt_outs: [] }]);
  check(e6 && e6.message.includes("no es de este camino"), `reserva de otro camino → "${e6?.message}"`);
}

// ── 4. Las guardas de la base frenan escrituras directas ─────────────────────
console.log("\nGuardas de la base");
const { error: g1 } = await admin.from("room_assignments").insert({
  reservation_id: noche2.id, reservation_room_id: slots2[0].id, room_index: 1, pilgrim_id: pareja[0],
});
check(g1 && g1.message.includes("no duerme"), `cama a quien no duerme → "${g1?.message}"`);
const { error: g2 } = await admin.from("reservation_opt_outs").insert({ reservation_id: noche2.id, pilgrim_id: resto[0], kind: "hospedaje" });
check(g2 && g2.message.includes("ya tiene cama"), `no duerme a quien tiene cama → "${g2?.message}"`);
const { error: g3 } = await admin.from("reservation_opt_outs").insert({ reservation_id: noche2.id, pilgrim_id: pareja[0], kind: "hospedaje" });
check(g3 && /duplicate|unique/i.test(g3.message), "el mismo opt-out dos veces se rechaza");
const { error: g4 } = await admin.from("reservation_opt_outs").insert({ reservation_id: noche2.id, pilgrim_id: resto[0], kind: "cena" });
check(!g4, `"no cena" no choca con la cama (es otra clase)${g4 ? ` — ${g4.message}` : ""}`);
if (!g4) await admin.from("reservation_opt_outs").delete().eq("reservation_id", noche2.id).eq("kind", "cena");

// ── 5. Limpieza: vaciar las dos noches por el mismo RPC ──────────────────────
console.log("\nLimpieza");
const { error: eLimpia } = await rpc(team, [
  { reservation_id: noche1.id, assignments: [], opt_outs: [] },
  { reservation_id: noche2.id, assignments: [], opt_outs: [] },
]);
check(!eLimpia, `vaciar por el RPC${eLimpia ? ` — ${eLimpia.message}` : ""}`);
ahora = await estado();
check(ahora.camas === antes.camas && ahora.opts === antes.opts, `las dos noches quedan como estaban (${ahora.camas} camas, ${ahora.opts} opt-outs)`);

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
