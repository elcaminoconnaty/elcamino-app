"use client";
import * as React from "react";

/**
 * Corre `onChange` cuando cambia la huella de lo que manda el servidor, sin correrla
 * en el primer render. Es para tableros con estado local que se inicializa una vez
 * con `useState(() => …)`: si otra pestaña edita la reserva y `revalidatePath` trae
 * props nuevos, sin esto el tablero se queda pintando una versión vieja.
 */
export function useResync(signature: string, onChange: () => void) {
  const aplicada = React.useRef(signature);
  React.useEffect(() => {
    if (aplicada.current === signature) return;
    aplicada.current = signature;
    onChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
