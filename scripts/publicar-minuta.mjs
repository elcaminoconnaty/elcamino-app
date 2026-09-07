/**
 * Publica la minuta del contrato en `app_settings.contract_template`.
 *
 * La minuta tiene que vivir en la base, no en el código: es lo que permite corregir una
 * cláusula sin desplegar, y lo que hace que `contracts.template_version` signifique algo
 * —qué texto exacto firmó cada peregrino— en vez de ser una constante del build.
 * `minuta.seed.json` es solo la versión de fábrica, la que se transcribió de los dos PDFs
 * firmados. Mientras la llave no exista, `minutaVigente()` cae al seed en silencio.
 *
 *   node --env-file=.env.local scripts/publicar-minuta.mjs
 *   node --env-file=.env.local scripts/publicar-minuta.mjs --forzar
 *
 * Sin `--forzar` no pisa una versión distinta a la del seed: si Naty ya corrigió la minuta
 * en la base, volver a correr esto no puede revertirle el cambio sin avisar.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const forzar = process.argv.includes("--forzar");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const semilla = JSON.parse(readFileSync(join(RAIZ, "lib/contracts/minuta.seed.json"), "utf8"));
if (!semilla.version) throw new Error("El seed no tiene `version`; sin eso no se puede sellar el contrato.");

const { data: fila, error } = await db
  .from("app_settings")
  .select("value, updated_at")
  .eq("key", "contract_template")
  .maybeSingle();
if (error) throw new Error(error.message);

const enBase = fila?.value?.version ?? null;
console.log(`En la base: ${enBase ?? "no hay minuta publicada"}`);
console.log(`En el seed: ${semilla.version}`);

if (enBase === semilla.version) {
  console.log("Es la misma versión. No hago nada.");
  process.exit(0);
}

if (enBase && !forzar) {
  console.error(
    `\nLa base tiene la versión ${enBase} y el seed trae la ${semilla.version}.\n` +
      `Si esa versión salió de una corrección hecha en la base, publicar el seed la borra.\n` +
      `Repetí con --forzar si de verdad querés pisarla.`
  );
  process.exit(1);
}

const { error: errEscritura } = await db
  .from("app_settings")
  .upsert({ key: "contract_template", value: semilla, updated_at: new Date().toISOString() }, { onConflict: "key" });
if (errEscritura) throw new Error(errEscritura.message);

console.log(`\nMinuta ${semilla.version} publicada. Los contratos que se generen ahora la sellan.`);
