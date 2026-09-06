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

export const metadata: Metadata = {
  title: "El Camino con Naty",
  description: "Plataforma comercial de El Camino con Naty",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "El Camino",
  },
  icons: {
    icon: [
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
