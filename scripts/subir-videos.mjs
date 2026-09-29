/**
 * Sube los videos personalizados de un camino al bucket privado de Railway y le crea a cada
 * peregrino su enlace personal (/video/<token>).
 *
 *   node --env-file=.env.local scripts/subir-videos.mjs "<nombre del camino>" <carpeta> [--mapa mapa.json] [--seco]
 *
 * El rótulo del archivo es también como la página la saluda ("Para ti, Maria Elena"): en el
 * grupo hay dos Marías, y a Elcy Licet le dicen Liz.
 *
 * Cada archivo se casa con una inscripción por el nombre: "Laura-1080 Horizontal web.mp4" →
 * la inscrita cuyo nombre o apodo empieza por "Laura". Lo que no case solo (apodos, "Jessica"
 * que en la base es "Yesica") va en el mapa: { "Jessica": "Yesica María Herrera Díaz" }.
 * Con --seco solo muestra cómo casó, sin subir nada.
 *
 * Si la inscripción ya tiene video, se reemplaza el archivo y se conserva el enlace: el
 * peregrino que ya lo recibió no tiene que pedir uno nuevo.
 */
import { createClient } from "@supabase/supabase-js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const seco = args.includes("--seco");
const iMapa = args.indexOf("--mapa");
const mapa = iMapa >= 0 ? JSON.parse(fs.readFileSync(args[iMapa + 1], "utf8")) : {};
const [camino, carpeta] = args.filter((a, i) => !a.startsWith("--") && i !== iMapa + 1);
if (!camino || !carpeta) {
  console.error('Uso: subir-videos.mjs "<nombre del camino>" <carpeta> [--mapa mapa.json] [--seco]');
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const s3 = new S3Client({
  endpoint: process.env.VIDEOS_S3_ENDPOINT,
  region: process.env.VIDEOS_S3_REGION || "auto",
  credentials: { accessKeyId: process.env.VIDEOS_S3_ACCESS_KEY_ID, secretAccessKey: process.env.VIDEOS_S3_SECRET_ACCESS_KEY },
});

const sinTildes = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const { data: dep } = await db.from("departures").select("id, name").eq("name", camino).maybeSingle();
if (!dep) { console.error(`No encontré el camino "${camino}".`); process.exit(1); }
const { data: regs } = await db
  .from("registrations")
  .select("id, status, pilgrims:pilgrim_id(full_name, nickname, is_team, deleted_at)")
  .eq("departure_id", dep.id)
  .neq("status", "cancelado");
const inscritos = (regs ?? []).filter((r) => r.pilgrims && !r.pilgrims.deleted_at);

function casar(etiqueta) {
  if (mapa[etiqueta]) return inscritos.filter((r) => sinTildes(r.pilgrims.full_name) === sinTildes(mapa[etiqueta]));
  const e = sinTildes(etiqueta);
  return inscritos.filter((r) =>
    [r.pilgrims.full_name, r.pilgrims.nickname].filter(Boolean).some((n) => {
      const nn = sinTildes(n);
      return nn === e || nn.startsWith(`${e} `) || nn.split(/\s+/).includes(e);
    })
  );
}

const archivos = fs.readdirSync(carpeta).filter((f) => /\.(mp4|mov|m4v)$/i.test(f)).sort();
const plan = [];
for (const f of archivos) {
  const etiqueta = f.replace(/\.[^.]+$/, "").split("-")[0].trim();
  const m = casar(etiqueta);
  if (m.length !== 1) {
    console.error(`  ✗ ${f}: ${m.length ? "casa con varios: " + m.map((r) => r.pilgrims.full_name).join(", ") : "no casa con nadie"}`);
    continue;
  }
  plan.push({ archivo: path.join(carpeta, f), reg: m[0], etiqueta });
  console.log(`  ✓ ${etiqueta.padEnd(14)} → ${m[0].pilgrims.full_name}`);
}
if (plan.length !== archivos.length) { console.error("\nArregla los que no casaron (con --mapa) antes de subir."); process.exit(1); }
if (seco) process.exit(0);

function medir(archivo) {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", archivo]));
  return { duration_s: Number(j.format.duration), width: j.streams[0].width, height: j.streams[0].height };
}

for (const { archivo, reg, etiqueta } of plan) {
  const { data: previo } = await db.from("pilgrim_videos").select("id, token, storage_key").eq("registration_id", reg.id).maybeSingle();
  const key = `${dep.id}/${reg.id}/${crypto.randomBytes(8).toString("hex")}.mp4`;
  const size = fs.statSync(archivo).size;
  process.stdout.write(`  ↑ ${reg.pilgrims.full_name} (${(size / 1e6).toFixed(0)} MB)… `);
  await new Upload({
    client: s3,
    params: { Bucket: process.env.VIDEOS_S3_BUCKET, Key: key, Body: fs.createReadStream(archivo), ContentType: "video/mp4", CacheControl: "private, max-age=86400" },
    queueSize: 4,
    partSize: 16 * 1024 * 1024,
  }).done();
  const fila = { registration_id: reg.id, storage_key: key, original_name: path.basename(archivo), nombre: etiqueta, size_bytes: size, ...medir(archivo) };
  const { error } = previo
    ? await db.from("pilgrim_videos").update(fila).eq("id", previo.id)
    : await db.from("pilgrim_videos").insert({ ...fila, token: crypto.randomBytes(32).toString("hex") });
  if (error) { console.error(`\n  error guardando: ${error.message}`); process.exit(1); }
  if (previo?.storage_key) await s3.send(new DeleteObjectCommand({ Bucket: process.env.VIDEOS_S3_BUCKET, Key: previo.storage_key }));
  console.log("listo");
}
console.log(`\n${plan.length} videos arriba en "${dep.name}".`);
