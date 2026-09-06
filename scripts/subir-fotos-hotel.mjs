/**
 * Sube fotos a la ficha de un proveedor.
 *   node --env-file=.env.local scripts/subir-fotos-hotel.mjs "Hotel Roma" foto1.jpg foto2.jpg …
 *
 * Es la herramienta de carga masiva; para una foto suelta está la ficha del proveedor.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const [hotel, ...archivos] = process.argv.slice(2);
if (!hotel || !archivos.length) {
  console.error('Uso: subir-fotos-hotel.mjs "<nombre del hotel>" <archivo>…');
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: p } = await db.from("providers").select("id, name").eq("name", hotel).maybeSingle();
if (!p) { console.error(`No encontré el proveedor "${hotel}".`); process.exit(1); }

const TIPOS = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const { data: previas } = await db.from("provider_photos").select("position").eq("provider_id", p.id);
let pos = (previas ?? []).reduce((m, f) => Math.max(m, f.position + 1), 0);

for (const a of archivos) {
  const ext = path.extname(a).toLowerCase();
  if (!TIPOS[ext]) { console.error(`  salto ${a}: tipo no admitido`); continue; }
  const ruta = `hoteles/${p.id}/${Date.now()}-${pos}${ext}`;
  const { error } = await db.storage.from("brand")
    .upload(ruta, fs.readFileSync(a), { contentType: TIPOS[ext], upsert: true });
  if (error) { console.error(`  error en ${a}: ${error.message}`); continue; }
  await db.from("provider_photos").insert({ provider_id: p.id, storage_path: ruta, position: pos });
  console.log(`  ${path.basename(a)} → posición ${pos}`);
  pos++;
}
console.log(`${p.name}: listo.`);
