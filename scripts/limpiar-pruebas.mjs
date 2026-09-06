/**
 * Borra los PDFs y trazos que dejó la prueba del módulo de contratos.
 * Los archivos de Storage no se van con el borrado de las filas, y un pasaporte o un
 * contrato huérfano en el cubo fue uno de los hallazgos de la auditoría de Camino Sacro.
 *
 *   node --env-file=.env.local scripts/limpiar-pruebas.mjs
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Devuelve todas las rutas de archivo bajo un prefijo, bajando por las carpetas. */
async function rutas(prefijo = "") {
  const { data } = await db.storage.from("contracts").list(prefijo, { limit: 1000 });
  const salida = [];
  for (const e of data ?? []) {
    const ruta = prefijo ? `${prefijo}/${e.name}` : e.name;
    // Storage marca las carpetas con id nulo.
    if (e.id === null) salida.push(...(await rutas(ruta)));
    else salida.push(ruta);
  }
  return salida;
}

// Solo lo que no está referenciado por ningún contrato vivo.
const todas = await rutas();
const { data: vivos } = await db.from("contracts").select("pdf_original_path, pdf_signed_path");
const referenciadas = new Set(
  (vivos ?? []).flatMap((c) => [c.pdf_original_path, c.pdf_signed_path]).filter(Boolean)
);
const huerfanas = todas.filter((r) => !referenciadas.has(r));

if (!huerfanas.length) {
  console.log(`Nada que borrar. ${todas.length} archivos, todos referenciados.`);
} else {
  const { error } = await db.storage.from("contracts").remove(huerfanas);
  if (error) throw new Error(error.message);
  console.log(`Borrados ${huerfanas.length} archivos huérfanos:`);
  for (const r of huerfanas) console.log("  ", r);
}
