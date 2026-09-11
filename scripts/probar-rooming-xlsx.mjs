/**
 * Comprueba el Excel del rooming list por hotel: que salga con la columna de pasaporte
 * de cada huésped (lo que piden los hoteles) y que el libro completo siga armándose.
 * Solo lee; no siembra nada.
 *
 *   npm run dev -- -p 3011
 *   node --env-file=.env.local scripts/probar-rooming-xlsx.mjs
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = "http://localhost:3011";
const DEP = "9c1a3bf2-072d-456e-9f69-096c5bb49268";
const { data: profiles } = await admin.from("profiles").select("id, app_role").in("app_role", ["nico", "naty", "admin"]).limit(1);
const { data: userRes } = await admin.auth.admin.getUserById(profiles[0].id);
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: userRes.user.email });
const team = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess } = await team.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
const raw = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64");
const name = `sb-${REF}-auth-token`;
const chunks = []; for (let i = 0; i < raw.length; i += 3180) chunks.push(raw.slice(i, i + 3180));
const cookie = chunks.length === 1 ? `${name}=${chunks[0]}` : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
const { data: filas } = await admin.from("v_rooming_list").select("provider_id, provider_name, pilgrim_name, passport_number").eq("departure_id", DEP).not("pilgrim_id", "is", null).limit(3);
console.log("filas con pasaporte:", filas);
const hotel = filas?.[0]?.provider_id;
for (const ruta of [`/api/export/caminos/${DEP}/habitaciones?hotel=${hotel}`, `/api/export/caminos/${DEP}/habitaciones`]) {
  const res = await fetch(`${BASE}${ruta}`, { headers: { cookie } });
  console.log(ruta, "→", res.status, res.headers.get("content-disposition"));
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
  console.log("  hojas:", wb.SheetNames.join(" | "));
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames.find((n) => n !== "Resumen") ?? wb.SheetNames[0]], { header: 1, blankrows: false });
  const cab = aoa.find((f) => f[0] === "Día");
  console.log("  cabecera:", cab?.join(" | "));
  const fila = aoa[aoa.indexOf(cab) + 1];
  console.log("  primera fila:", JSON.stringify(fila));
}
