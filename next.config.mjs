/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    // En builds de producción desactivamos la caché persistente de webpack.
    // La `.next/cache` se comparte entre builds en Railway (cache mount) y se
    // corrompió, provocando falsos "Module not found" en imports @/components/ui/*
    // de algunos archivos (p. ej. route-quick-create.tsx) aunque el archivo existe.
    // Sin caché persistente, cada build resuelve los módulos en limpio.
    if (!dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
