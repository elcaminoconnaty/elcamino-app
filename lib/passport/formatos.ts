/**
 * Qué archivos de pasaporte aceptamos. Vive fuera de `extraer.ts` (que es `server-only`)
 * porque el formulario de carga tiene que validar lo mismo en el navegador, antes de
 * gastar una subida en un archivo que Claude no va a poder leer.
 */

export const PDF = "application/pdf";

/** Los formatos de imagen que lee la API de Claude. El HEIC del iPhone no está. */
const IMAGENES_QUE_LEE_CLAUDE = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Para el `accept` del input y para el diálogo de archivos del sistema. */
export const ACEPTA_PASAPORTE = [...IMAGENES_QUE_LEE_CLAUDE, PDF].join(",");

/**
 * Tope de peso del PDF. La API admite 32 MB por petición y el base64 infla un tercio,
 * así que por encima de esto el archivo sube bien y después falla al leerlo.
 */
export const MAX_PDF_MB = 20;

/** Por el tipo del archivo se decide si va como imagen o como documento. */
export function tipoDeArchivoDePasaporte(mime: string): "imagen" | "pdf" | null {
  if (mime === PDF) return "pdf";
  if (IMAGENES_QUE_LEE_CLAUDE.includes(mime)) return "imagen";
  return null;
}

/** El aviso que se le muestra a quien sube un archivo que no vamos a poder leer. */
export function porQueNoSirve(mime: string): string {
  if (mime === "image/heic" || mime === "image/heif") {
    return "Ese archivo es HEIC (el formato del iPhone) y no lo podemos leer. En el iPhone: Compartir → Opciones → Formato: Más compatible, o mandalo como JPG.";
  }
  return "Solo podemos leer fotos JPG, PNG, WEBP o GIF, y pasaportes en PDF.";
}

/** `null` si el archivo sirve; si no, qué tiene de malo, para mostrarlo tal cual. */
export function revisarArchivoDePasaporte(file: File): string | null {
  const clase = tipoDeArchivoDePasaporte(file.type);
  if (!clase) return porQueNoSirve(file.type);
  if (clase === "pdf" && file.size > MAX_PDF_MB * 1024 * 1024) {
    return `El PDF pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${MAX_PDF_MB} MB. Mandá solo la página de los datos.`;
  }
  return null;
}
