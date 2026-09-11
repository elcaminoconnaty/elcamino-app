/**
 * Tres cosas acá no son opcionales; las tres salieron de la auditoría de Camino Sacro,
 * donde cada una costó un incidente real en producción.
 *
 * 1. react-pdf tiene que quedar fuera del bundle del servidor. Si Next intenta
 *    empaquetarlo, las fuentes registradas se pierden y revienta con
 *    "Font family not registered" solo en producción.
 * 2. El límite de 1 MB de las server actions tumbó la primera firma real: la foto
 *    del pasaporte de un celular pesa entre 3 y 8 MB.
 * 3. Las rutas públicas por token no pueden filtrar el token por el Referer ni
 *    terminar indexadas en Google.
 */

/** Rutas públicas que sirven un documento a alguien que no tiene sesión. */
const RUTAS_POR_TOKEN = [
  "/firmar/:token*", "/verificar/:hash*", "/viaje/:token*", "/correo/:token*", "/menu/:token*", "/registro/:token*",
  "/api/pdf/contrato/publico/:token*", "/api/pdf/viaje/:token*",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next 14 todavía lo llama así; en 15 pasa a `serverExternalPackages` en la raíz.
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
    serverActions: { bodySizeLimit: "15mb" },
  },
  async headers() {
    return RUTAS_POR_TOKEN.map((source) => ({
      source,
      headers: [
        // Sin esto, el token viaja en el Referer a cualquier enlace saliente.
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    }));
  },
};

export default nextConfig;
