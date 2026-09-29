import "server-only";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * El bucket privado de Railway donde viven los videos de los peregrinos (`videos-peregrinos`).
 *
 * Por qué no Supabase Storage: el plan gratis corta cada archivo en 50 MB y el total en 1 GB,
 * y un solo camino ya pesa 1,5 GB. En Railway el almacenamiento cuesta centavos y la salida
 * es gratis, que es justo lo que gasta un video.
 *
 * El bucket no es público: el navegador recibe una URL firmada que vence. La página la firma
 * cada vez que se abre, así que el enlace personal nunca caduca pero la URL del archivo sí.
 */

let cliente: S3Client | null = null;
function s3() {
  if (cliente) return cliente;
  const { VIDEOS_S3_ENDPOINT, VIDEOS_S3_ACCESS_KEY_ID, VIDEOS_S3_SECRET_ACCESS_KEY } = process.env;
  if (!VIDEOS_S3_ENDPOINT || !VIDEOS_S3_ACCESS_KEY_ID || !VIDEOS_S3_SECRET_ACCESS_KEY) {
    throw new Error("Faltan las credenciales del bucket de videos (VIDEOS_S3_*). Salen de Railway → videos-peregrinos → Credentials.");
  }
  // Railway firma con región "auto"; la variable de referencia trae "iad" y no sirve para firmar.
  cliente = new S3Client({
    endpoint: VIDEOS_S3_ENDPOINT,
    region: "auto",
    credentials: { accessKeyId: VIDEOS_S3_ACCESS_KEY_ID, secretAccessKey: VIDEOS_S3_SECRET_ACCESS_KEY },
  });
  return cliente;
}

/**
 * Siete días, el máximo que permite la firma S3: una pestaña que el peregrino deja en pausa y
 * retoma al día siguiente sigue andando. Y si aun así vence, el reproductor recarga la página
 * (que firma de nuevo).
 */
const VIGENCIA_S = 7 * 24 * 60 * 60 - 60;

export async function urlFirmada(key: string, opciones?: { descargarComo?: string }): Promise<string> {
  const nombre = opciones?.descargarComo;
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: process.env.VIDEOS_S3_BUCKET,
      Key: key,
      ...(nombre
        ? { ResponseContentDisposition: `attachment; filename="${nombre.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}` }
        : {}),
    }),
    { expiresIn: VIGENCIA_S }
  );
}
