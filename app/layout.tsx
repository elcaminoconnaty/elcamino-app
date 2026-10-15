import type { Metadata, Viewport } from "next";
import { Cinzel, Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Las tres voces del brandbook. DM Sans carga todo lo que se lee y se opera; Cormorant,
// los titulares y las citas; Cinzel es solo el sello, en mayúscula y espaciado.
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-seal",
  display: "swap",
});

/** Pantallas de arranque de la app instalada en el iPhone (`scripts/generar-splash.py`).
 *  iOS escoge la que coincide exactamente con el ancho, alto y densidad de la pantalla. */
const SPLASH: [number, number, number][] = [
  [440, 956, 3], [430, 932, 3], [428, 926, 3], [402, 874, 3], [393, 852, 3],
  [390, 844, 3], [414, 896, 3], [414, 896, 2], [375, 812, 3], [375, 667, 2],
];

export const metadata: Metadata = {
  title: "El Camino con Naty",
  description: "Plataforma comercial de El Camino con Naty",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // Instalada como app, la barra de estado queda transparente sobre la cabecera atlántico
    // (en el celular la cabecera es de ese color y le reserva el alto con safe-area-inset-top).
    statusBarStyle: "black-translucent",
    title: "El Camino",
    startupImage: SPLASH.map(([w, h, r]) => ({
      url: `/splash/splash-${w * r}x${h * r}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
    })),
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#3D5A6E",   // atlántico: la barra del navegador es cabecera de marca
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${dmSans.variable} ${cormorant.variable} ${cinzel.variable}`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
