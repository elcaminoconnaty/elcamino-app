import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { ContratoPDF } from "@/components/pdf/contrato";
import type { InformeFirmasProps } from "@/components/pdf/informe-firmas";
import type { DatosContrato, Minuta } from "./minuta";
import { sha256 } from "./firma";

/**
 * Renderiza el contrato y devuelve el PDF con su huella.
 *
 * `@react-pdf/renderer` y sus componentes tienen que resolverse siempre por el mismo camino
 * de importación, o revienta con "Font family not registered" solo en producción. Por eso
 * todo el renderizado de contratos pasa por acá.
 */
export async function renderContrato(opciones: {
  minuta: Minuta;
  datos: DatosContrato;
  codigo: string;
  trazos?: Partial<Record<"viajero" | "camino", string>>;
  informe?: InformeFirmasProps;
}): Promise<{ pdf: Buffer; sha256: string; paginas: number }> {
  const pdf = await renderToBuffer(ContratoPDF(opciones) as any);
  return { pdf, sha256: sha256(pdf), paginas: contarPaginas(pdf) };
}

/**
 * Cuenta las páginas del PDF leyendo su catálogo.
 * Hace falta porque el Informe de Firmas dice de cuántas páginas consta el documento, y en
 * react-pdf 4.5.1 no se puede pedir el total desde dentro (un `render` dinámico en un
 * elemento `fixed` rompe el layout en documentos de este largo).
 */
export function contarPaginas(pdf: Buffer): number {
  const texto = pdf.toString("latin1");
  const paginas = (texto.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  return paginas || 1;
}
