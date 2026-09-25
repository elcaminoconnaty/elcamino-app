import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Un paso del recorrido de una inscripción (contrato → carta → formulario): el número o
 * el visto, el título con su estado a la derecha y lo que se puede hacer debajo. Los pasos
 * se enhebran con una línea vertical, como una ruta con sus paradas.
 *
 * `estado` decide el color: hecho en musgo, en curso en ocre, pendiente en gris.
 */
export type EstadoPaso = "hecho" | "en_curso" | "pendiente";

export function Paso({
  numero,
  titulo,
  estado,
  resumen,
  ultimo = false,
  children,
}: {
  numero: number;
  titulo: string;
  estado: EstadoPaso;
  /** "Firmado · 12 sep 2026", "Enviado, sin abrir"… */
  resumen: string;
  ultimo?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-3">
      {!ultimo && <span aria-hidden className="absolute left-[13px] top-8 bottom-0 w-px bg-border" />}
      <span
        className={cn(
          "relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          estado === "hecho" && "bg-musgo text-alba",
          estado === "en_curso" && "bg-ocre text-noche",
          estado === "pendiente" && "border border-border bg-background text-muted-foreground"
        )}
      >
        {estado === "hecho" ? <Check className="h-4 w-4" /> : numero}
      </span>
      <div className={cn("min-w-0 flex-1", !ultimo && "pb-5")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h3 className="text-sm font-medium text-noche">{titulo}</h3>
          <span
            className={cn(
              "text-xs",
              estado === "hecho" && "text-ok-700",
              estado === "en_curso" && "text-aviso-800",
              estado === "pendiente" && "text-muted-foreground"
            )}
          >
            {resumen}
          </span>
        </div>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  );
}

/** La lista que contiene los pasos. */
export function PasoAPaso({ children }: { children: React.ReactNode }) {
  return <ol className="list-none p-0 m-0">{children}</ol>;
}
