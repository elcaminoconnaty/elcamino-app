/**
 * Arma la carta de bienvenida de cada camino abierto (genérica y con un nombre de prueba)
 * y la deja en una carpeta para mirarla. Solo lee de la base.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/probar-carta-bienvenida.tsx <carpeta>
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarCarta, destinatarioDe, nombreDeArchivo } from "@/lib/bienvenida/datos";
import { CartaBienvenidaPDF } from "@/components/pdf/carta-bienvenida";

const carpeta = process.argv[2] ?? ".";
(async () => {
  const { data: deps } = await createAdminClient().from("departures").select("id, name").neq("status", "cancelled").order("start_date");
  for (const d of deps ?? []) {
    const carta = await armarCarta(d.id, { publico: true });
    console.log(`\n${d.name}\n  encuentro: ${JSON.stringify(carta.encuentro)}\n  cierre: ${JSON.stringify(carta.cierre)} · ${carta.dias} días · ${carta.etapas} etapas · ${carta.km} km · ritual ${JSON.stringify(carta.ritual)}`);
    carta.itinerario.forEach((x) => console.log(`   ${x.chip.padEnd(7)} ${(x.etapa ?? "").padEnd(8)} ${x.texto} ${x.km ?? ""}`));
    if (carta.pendientes.length) console.log("  PENDIENTES:", carta.pendientes);
    for (const c of [carta, { ...carta, destinatario: destinatarioDe({ full_name: "Laura Andrea Prueba", sex: "F" }) }]) {
      const pdf = await renderToBuffer(CartaBienvenidaPDF({ carta: c }) as any);
      const f = path.join(carpeta, nombreDeArchivo(c));
      fs.writeFileSync(f, pdf);
      console.log("  →", f, `${Math.round(pdf.length / 1024)} KB`);
    }
  }
})();
