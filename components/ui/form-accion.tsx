"use client";
import * as React from "react";
import { toast } from "@/components/ui/toaster";
import { useAccionUnica } from "@/components/ui/submit-button";
import type { Resultado } from "@/lib/resultado";

/**
 * `<form>` para una acción del servidor que devuelve `Resultado` (o redirige si sale bien).
 * Sirve desde una página de servidor: muestra el error real en un toast (un `throw` llega
 * vacío en producción) y no deja enviar dos veces. Adentro va un `<SubmitButton>`.
 */
export function FormAccion({
  action,
  tituloError = "No se pudo guardar",
  children,
  ...props
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "action"> & {
  action: (fd: FormData) => Promise<Resultado<object> | void>;
  tituloError?: string;
}) {
  const enviar = useAccionUnica(async (fd: FormData) => {
    const r = await action(fd);
    if (r && !r.ok) toast({ title: tituloError, description: r.error, variant: "destructive" });
  });
  return (
    <form action={enviar} {...props}>
      {children}
    </form>
  );
}
