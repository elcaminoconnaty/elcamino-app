/**
 * Baja el informe de pagos pendientes (PDF y Excel) del camino Sept/Oct-2026 con sesión de
 * equipo y comprueba que salgan las columnas de la hoja de Naty. Solo lee.
 *
 *   npm run dev -- -p 3011
 *   node --env-file=.env.local scripts/probar-pagos-pendientes.mjs [carpeta-para-el-pdf]
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = "http://localhost:3011";
const DEP = "9c1a3bf2-072d-456e-9f69-096c5bb49268";
let fallos = 0;
const check = (ok, m) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };
const { data: profiles } = await admin.from("profiles").select("id, app_role").in("app_role", ["nico", "naty", "admin"]).limit(1);
const { data: userRes } = await admin.auth.admin.getUserById(profiles[0].id);
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: userRes.user.email });
const team = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess } = await team.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
const raw = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64");
const name = `sb-${REF}-auth-token`;
const chunks = []; for (let i = 0; i < raw.length; i += 3180) chunks.push(raw.slice(i, i + 3180));
const cookie = chunks.length === 1 ? `${name}=${chunks[0]}` : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");

const xl = await fetch(`${BASE}/api/export/caminos/${DEP}/pagos-pendientes`, { headers: { cookie } });
check(xl.status === 200, `Excel → ${xl.status} · ${xl.headers.get("content-disposition")}`);
const wb = XLSX.read(Buffer.from(await xl.arrayBuffer()), { type: "buffer" });
console.log("  hojas:", wb.SheetNames.join(" | "));
const filas = XLSX.utils.sheet_to_json(wb.Sheets["Pagos pendientes"]);
check(filas.length > 1 && "MEDIO DE PAGO" in filas[0] && "DATOS DE PAGO" in filas[0] && "SALDO (COP)" in filas[0], `columnas: ${Object.keys(filas[0] ?? {}).join(" | ")}`);
const total = filas.find((f) => f["PROVEEDOR"] === "TOTAL");
check(!!total && Number(total["SALDO (€)"]) > 0, `fila TOTAL con saldo ${total?.["SALDO (€)"]} €`);
console.log("  primeras filas:", filas.slice(0, 3).map((f) => `${f["PROVEEDOR"]} · ${f["SERVICIO"]} · saldo ${f["SALDO (€)"]} € · ${f["MEDIO DE PAGO"]} · ${f["PRÓXIMA CUOTA"]}`).join("\n                  "));

const pdf = await fetch(`${BASE}/api/pdf/pagos-pendientes/${DEP}`, { headers: { cookie } });
check(pdf.status === 200 && (pdf.headers.get("content-type") ?? "").includes("pdf"), `PDF → ${pdf.status} · ${pdf.headers.get("content-disposition")}`);
const buf = Buffer.from(await pdf.arrayBuffer());
check(buf.length > 5000 && buf.subarray(0, 4).toString() === "%PDF", `PDF de ${(buf.length / 1024).toFixed(0)} KB`);
if (process.argv[2]) { writeFileSync(`${process.argv[2]}/pagos-pendientes.pdf`, buf); console.log("  guardado en", `${process.argv[2]}/pagos-pendientes.pdf`); }
console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
