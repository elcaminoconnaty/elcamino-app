/// <reference types="react-dom/canary" />
"use client";
import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Botón de envío para `<form action={…}>`: se deshabilita mientras la acción corre.
 *
 * Por qué: dos toques seguidos (fácil en el iPhone con red lenta) mandaban el formulario dos
 * veces y quedaban dos pagos, dos gastos o dos reservas. `useFormStatus` lee el estado del
 * `<form>` que lo contiene, así que tiene que ir DENTRO del formulario.
 */
export function SubmitButton({
  children,
  pendingText = "Guardando…",
  disabled,
  ...props
}: ButtonProps & { pendingText?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

/**
 * Envuelve una acción para que un segundo envío mientras la primera sigue corriendo se
 * ignore. El botón deshabilitado cubre casi todo; esto cubre el doble toque que alcanza a
 * entrar antes de que React vuelva a pintar el botón.
 */
export function useAccionUnica<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  const enCurso = React.useRef(false);
  return React.useCallback(
    async (...args: A) => {
      if (enCurso.current) return;
      enCurso.current = true;
      try {
        await fn(...args);
      } finally {
        enCurso.current = false;
      }
    },
    [fn]
  );
}
