/**
 * Deja los nombres ya cargados como los guardamos de ahora en más: nombre primero,
 * apellido después y en "Nombre Apellido" en vez de MAYÚSCULA SOSTENIDA.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/arreglar-nombres.ts            (simula)
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/arreglar-nombres.ts --aplicar  (escribe)
 *
 * Es re-ejecutable: los que ya están bien no se tocan. Al aplicar imprime el SQL para
 * deshacerlo, por si algún nombre quedó mal partido.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createAdminClient } from "@/lib/supabase/admin";
import { armarNombreCompleto, compararNombres } from "@/lib/passport/nombres";

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const supabase = createAdminClient();

  const { data: pilgrims, error } = await supabase
    .from("pilgrims")
    .select("id, full_name, passport_mrz")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  const cambios = (pilgrims ?? [])
    .map((p: any) => ({ ...p, nuevo: armarNombreCompleto({ full_name: p.full_name, mrz: p.passport_mrz }) }))
    .filter((p: any) => p.nuevo && p.nuevo !== p.full_name)
    .sort((a: any, b: any) => compararNombres(a.nuevo, b.nuevo));

  console.log(`${pilgrims?.length ?? 0} peregrinos · ${cambios.length} para corregir\n`);
  if (cambios.length === 0) {
    console.log("Todos los nombres ya están como los queremos.");
    return;
  }

  const soloLetras = (s: string) => s.toLowerCase().replace(/[^a-záéíóúüñ]/g, "");
  const queCambio = (viejo: string, nuevo: string) => {
    if (soloLetras(viejo) !== soloLetras(nuevo)) return "";
    if (viejo.replace(/\s+/g, " ").trim() === nuevo) return "   (espacios sobrantes)";
    return "   (solo mayúsculas)";
  };
  const ancho = Math.max(...cambios.map((c: any) => c.full_name.length));
  for (const c of cambios) {
    console.log(`  ${c.full_name.padEnd(ancho)}  →  ${c.nuevo}${queCambio(c.full_name, c.nuevo)}`);
  }

  if (!aplicar) {
    console.log("\nSimulación: no se escribió nada. Volvé a correrlo con --aplicar.");
    return;
  }

  console.log("\n-- Para deshacer:");
  for (const c of cambios) {
    console.log(`update pilgrims set full_name = '${c.full_name.replace(/'/g, "''")}' where id = '${c.id}';`);
  }

  let ok = 0;
  for (const c of cambios) {
    const { error: e } = await supabase.from("pilgrims").update({ full_name: c.nuevo }).eq("id", c.id);
    if (e) console.log(`  ✗ ${c.full_name}: ${e.message}`);
    else ok++;
  }
  console.log(`\n${ok} de ${cambios.length} corregidos.`);
}

main();
