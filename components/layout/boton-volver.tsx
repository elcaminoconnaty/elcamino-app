"use client";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/** Las pantallas de primer nivel: ahí no hay "volver", hay barra de pestañas. */
const RAIZ = ["/", "/dashboard/naty", "/dashboard/nico", "/caminos", "/peregrinos", "/asistente", "/pagos",
  "/pagos-proveedores", "/proveedores", "/gastos", "/trm", "/configuracion", "/actividad"];

/**
 * Instalada como app en el iPhone no hay botón de atrás del navegador ni barra de
 * direcciones: sin esto, desde la ficha de un peregrino no había forma de devolverse.
 * Si la app se abrió directo en esta pantalla (no hay historial), sube un nivel.
 */
export function BotonVolver() {
  const pathname = usePathname();
  const router = useRouter();
  if (RAIZ.includes(pathname)) return null;

  function volver() {
    if (window.history.length > 1) router.back();
    else router.push(pathname.split("/").slice(0, -1).join("/") || "/");
  }

  return (
    <button
      onClick={volver}
      aria-label="Volver"
      className="md:hidden -ml-2 h-10 w-10 rounded-md flex items-center justify-center active:bg-white/10"
    >
      <ChevronLeft className="h-6 w-6" />
    </button>
  );
}
