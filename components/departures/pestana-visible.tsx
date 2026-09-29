"use client";

import { useEffect } from "react";

/**
 * En el celular la barra de pestañas del camino se desliza de lado y la pestaña activa (Cenas,
 * Videos…) quedaba fuera de la pantalla. Al cargar, la trae a la vista.
 */
export function PestanaVisible({ navId }: { navId: string }) {
  useEffect(() => {
    document.getElementById(navId)?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [navId]);
  return null;
}
