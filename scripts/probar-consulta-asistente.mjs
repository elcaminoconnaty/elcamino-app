// Candados de asistente_consulta: lee, pero no escribe por ningún camino, y nada sin sesión.
//   node --env-file=.env.local scripts/probar-consulta-asistente.mjs
import { createClient } from "@supabase/supabase-js";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "elcaminoconnaty@gmail.com" });
const sb = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await sb.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
const run = async (label, q, get = true) => { const { data, error } = await sb.rpc("asistente_consulta", { q }, { get }); console.log(label, error ? "ERROR: " + error.message : JSON.stringify(data).slice(0, 300)); };
await run("lectura:", `select p.full_name, coalesce(c.status,'sin contrato') estado from registrations r join pilgrims p on p.id=r.pilgrim_id join departures d on d.id=r.departure_id left join lateral (select * from contracts c where c.registration_id=r.id and c.status<>'anulado' order by version desc limit 1) c on true where d.name ilike '%abril%' and r.status<>'cancelado' and p.deleted_at is null and not p.is_team and coalesce(c.status,'')<>'firmado' order by 1`);
await run("delete:", "delete from trm_rates where date='1900-01-01'");
await run("cte-delete:", "with x as (delete from trm_rates where date='1900-01-01' returning 1) select * from x");
await run("rpc que escribe:", "select set_departure_settlement_mode('00000000-0000-0000-0000-000000000000','recalculo')");
// Por POST también corre en solo lectura: PostgREST ejecuta las funciones STABLE en READ ONLY.
await run("por POST, RPC que escribe:", "select set_departure_settlement_mode('00000000-0000-0000-0000-000000000000','recalculo')", false);
await run("dos sentencias:", "select 1; select 2");
const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const r = await anon.rpc("asistente_consulta", { q: "select 1" }, { get: true }); console.log("sin sesión:", r.error?.message ?? "MAL " + JSON.stringify(r.data));
