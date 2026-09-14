/**
 * Baja el informe de pagos a proveedores (Excel y PDF), por camino y global, y comprueba
 * que las hojas traigan los datos sueltos que pide el banco. Solo lee.
 *
 *   npm run dev -- -p 3011
 *   node --env-file=.env.local scripts/probar-pagos-proveedores.mjs [carpeta-para-el-pdf]
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

const HOJAS = ["Resumen", "Transferencias", "Bizum", "Otros medios", "Faltan datos", "Otros del presupuesto"];
const COLS_BANCO = ["TITULAR", "IBAN", "SWIFT / BIC", "IMPORTE (€)", "CONCEPTO / REFERENCIA", "VENCE"];

async function excel(url, etiqueta) {
  const res = await fetch(`${BASE}${url}`, { headers: { cookie } });
  check(res.status === 200, `${etiqueta} · Excel → ${res.status}`);
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
  check(HOJAS.every((h) => wb.SheetNames.includes(h)), `${etiqueta} · hojas: ${wb.SheetNames.join(" | ")}`);
  return wb;
}

console.log("\n— Informe de un camino —");
const wb = await excel(`/api/export/caminos/${DEP}/pagos-pendientes`, "camino");
const resumen = XLSX.utils.sheet_to_json(wb.Sheets["Resumen"]);
const total = resumen.find((f) => f["CONCEPTO"] === "Total a pagar (€)");
check(Number(total?.["VALOR"]) > 0, `total a pagar: ${total?.["VALOR"]} €`);
const nPagos = resumen.find((f) => f["CONCEPTO"] === "Pagos por hacer");
check(Number(nPagos?.["VALOR"]) > 0, `pagos por hacer: ${nPagos?.["VALOR"]}`);

const transf = XLSX.utils.sheet_to_json(wb.Sheets["Transferencias"]);
const otros = XLSX.utils.sheet_to_json(wb.Sheets["Otros medios"]);
const conFilas = transf.length > 0 ? transf : otros;
check(conFilas.length > 0, `filas con giro: ${transf.length} transferencia(s), ${otros.length} otro(s) medio(s)`);
if (transf.length > 0) {
  check(COLS_BANCO.every((c) => c in transf[0]), `columnas del banco sueltas: ${Object.keys(transf[0]).join(" | ")}`);
} else {
  console.log("  · sin transferencias cargadas todavía; columnas de 'Otros medios':", Object.keys(otros[0] ?? {}).join(" | "));
}
console.log("  primeros giros:", conFilas.slice(0, 4).map((f) => `${f["PROVEEDOR"]} · ${f["CONCEPTO DEL PAGO"]} · ${f["IMPORTE (€)"]} € · vence ${f["VENCE"]}`).join("\n                 "));

const faltan = XLSX.utils.sheet_to_json(wb.Sheets["Faltan datos"]);
console.log(`  · ${faltan.length} giro(s) con datos incompletos`);

console.log("\n— Informe global —");
const wbG = await excel("/api/export/pagos-proveedores", "global");
const gTransf = XLSX.utils.sheet_to_json(wbG.Sheets["Transferencias"]);
const gOtros = XLSX.utils.sheet_to_json(wbG.Sheets["Otros medios"]);
check(gTransf.length + gOtros.length >= conFilas.length, `el global (${gTransf.length + gOtros.length}) incluye al menos lo del camino (${conFilas.length})`);
const caminos = new Set([...gTransf, ...gOtros].map((f) => f["CAMINO"]));
console.log("  caminos en el informe:", [...caminos].join(" | ") || "—");

console.log("\n— Filtro por fecha —");
const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const wbF = await excel(`/api/export/pagos-proveedores?hasta=${ayer}`, `hasta ${ayer}`);
const fTransf = XLSX.utils.sheet_to_json(wbF.Sheets["Transferencias"]);
const fOtros = XLSX.utils.sheet_to_json(wbF.Sheets["Otros medios"]);
check(fTransf.length + fOtros.length <= gTransf.length + gOtros.length, `recortado a ${fTransf.length + fOtros.length} de ${gTransf.length + gOtros.length}`);

console.log("\n— PDF —");
for (const [url, etiqueta, archivo] of [
  [`/api/pdf/pagos-pendientes/${DEP}`, "camino", "pagos-proveedores-camino.pdf"],
  ["/api/pdf/pagos-proveedores", "global", "pagos-proveedores-global.pdf"],
]) {
  const pdf = await fetch(`${BASE}${url}`, { headers: { cookie } });
  const buf = Buffer.from(await pdf.arrayBuffer());
  check(pdf.status === 200 && buf.subarray(0, 4).toString() === "%PDF" && buf.length > 5000,
    `${etiqueta} → ${pdf.status} · ${(buf.length / 1024).toFixed(0)} KB`);
  if (process.argv[2] && buf.subarray(0, 4).toString() === "%PDF") {
    writeFileSync(`${process.argv[2]}/${archivo}`, buf);
    console.log("  guardado en", `${process.argv[2]}/${archivo}`);
  }
}

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
process.exit(fallos ? 1 : 0);
