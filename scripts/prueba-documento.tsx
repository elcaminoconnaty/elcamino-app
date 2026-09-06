/**
 * Genera el documento de viaje de un camino con los datos reales.
 *   node/npx tsx --tsconfig scripts/tsconfig.json scripts/prueba-documento.tsx <departure_id>
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import { renderToBuffer } from "@react-pdf/renderer";
import { armarDocumentoDeViaje } from "@/lib/travel-doc/datos";
import { DocumentoViajePDF } from "@/components/pdf/documento-viaje";

(async () => {
  const doc = await armarDocumentoDeViaje(process.argv[2], { publico: true });
  console.log(`camino:   ${doc.camino}`);
  console.log(`recorrido:${doc.recorrido ?? " —"}  ${doc.km ?? "?"} km  ·  etiqueta ${doc.etiqueta}`);
  console.log(`días:     ${doc.dias.length}`);
  console.log(`hoteles:  ${doc.alojamientos.length}`);
  for (const a of doc.alojamientos) {
    console.log(`   ${a.ciudad}: ${a.nombre} · ${a.noches} noche(s) · ${a.acomodacion ?? "sin acomodación"}` +
      (a.compartidoCon ? ` · comparte noche con ${a.compartidoCon}` : ""));
  }
  if (doc.pendientes.length) {
    console.log(`\npendientes (${doc.pendientes.length}):`);
    for (const p of doc.pendientes) console.log("   ·", p);
  }
  const pdf = await renderToBuffer(<DocumentoViajePDF doc={doc} />);
  fs.writeFileSync(`${process.env.OUT}/documento-viaje.pdf`, pdf);
  console.log(`\nPDF: ${(pdf.length / 1024).toFixed(0)} kB`);
})().catch((e) => { console.error("FALLÓ:", e.message); process.exit(1); });
