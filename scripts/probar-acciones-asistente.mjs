/**
 * Confirmar / cancelar una acción del asistente, sin mandar correos: la propuesta de prueba
 * va con la lista vacía (como si todos se omitieran), así que ejecutar no envía nada.
 *   npx next dev -p 3011   ·   node --env-file=.env.local scripts/probar-acciones-asistente.mjs
 */
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.PRUEBA_URL ?? "http://localhost:3011";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "elcaminoconnaty@gmail.com" });
const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess } = await sb.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
const cookie = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(sess.session)).toString("base64")}`;
let fallos = 0;
const check = (ok, m) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };

const { data: dep } = await sb.from("departures").select("id").limit(1).single();
const { data: conv } = await sb.from("assistant_conversations").insert({ user_id: sess.user.id, title: "[prueba] acciones" }).select("id").single();
const nueva = async () => (await sb.from("assistant_actions").insert({
  conversation_id: conv.id, user_id: sess.user.id, kind: "enviar_contratos",
  params: { departure_id: dep.id, registration_ids: [] },
  preview: { titulo: "[prueba] sin destinatarios", detalle: "prueba", filas: [], ejecutables: 0, boton: "Enviar 0" },
}).select("id").single()).data.id;
const decidir = async (id, decision) => {
  const r = await fetch(`${BASE}/api/asistente/acciones/${id}`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
  return { status: r.status, body: await r.json() };
};

const a = await nueva();
let r = await decidir(a, "cancelar");
check(r.status === 200 && r.body.accion?.status === "cancelada", `cancelar → ${r.status} ${r.body.accion?.status}`);
r = await decidir(a, "confirmar");
check(r.status === 409, `confirmar una cancelada → ${r.status}`);

const b = await nueva();
const [r1, r2] = await Promise.all([decidir(b, "confirmar"), decidir(b, "confirmar")]);
const estados = [r1.status, r2.status].sort();
check(estados[0] === 200 && estados[1] === 409, `doble toque: una corre y la otra no → ${estados.join(", ")}`);
const ok = [r1, r2].find((x) => x.status === 200);
check(ok?.body.accion?.status === "ejecutada", `ejecutada → ${ok?.body.accion?.status} · ${ok?.body.accion?.resultado?.resumen}`);

const { data: msgs } = await sb.from("assistant_messages").select("content").eq("conversation_id", conv.id);
check((msgs ?? []).length === 2, `quedó anotado en la conversación (${msgs?.length} mensajes)`);
const { data: audit } = await sb.from("audit_log").select("user_name, op").eq("table_name", "assistant_actions").in("row_id", [a, b]);
check((audit ?? []).length >= 4, `bitácora con autor: ${audit?.length} filas, ${audit?.[0]?.user_name}`);
console.log(fallos ? `\n${fallos} fallos` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
