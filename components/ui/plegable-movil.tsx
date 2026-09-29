"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Plegado solo en el celular: ahí el contenido arranca cerrado detrás de un botón; desde `sm`
 * se ve siempre y el botón no aparece. Va con CSS (hidden sm:block) y no con matchMedia para que
 * el escritorio no parpadee ni cambie en nada al cargar.
 */
export function PlegableMovil({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="-mt-2 mb-2 flex min-h-11 w-full items-center justify-between gap-2 px-6 text-left text-sm text-muted-foreground sm:hidden"
      >
        <span>{abierto ? "Ocultar" : etiqueta}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", abierto && "rotate-180")} />
      </button>
      <div className={abierto ? undefined : "hidden sm:block"}>{children}</div>
    </>
  );
}
