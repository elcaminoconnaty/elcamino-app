"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Le pone a cada celda el nombre de su columna (`data-label`) para que en el celular la
 * fila se lea como tarjeta (ver `.tabla-apilable` en globals.css). Se hace en el navegador
 * y no a mano en cada tabla: son más de quince y los encabezados cambian. Respeta colspan
 * y vuelve a etiquetar si las filas cambian (filtros, guardados).
 */
function etiquetar(tabla: HTMLTableElement) {
  const encabezados: string[] = [];
  tabla.querySelectorAll("thead tr:last-child th").forEach((th) => {
    // Una columna de botones (data-acciones) no lleva etiqueta en la tarjeta: queda como fila de
    // botones y no como "Registrar · [botón]". En escritorio el encabezado se sigue viendo.
    const texto = (th as HTMLElement).hasAttribute("data-acciones") ? "" : (th as HTMLElement).innerText.trim();
    const span = Number((th as HTMLTableCellElement).colSpan) || 1;
    for (let i = 0; i < span; i++) encabezados.push(texto);
  });
  tabla.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => {
    let col = 0;
    Array.from((tr as HTMLTableRowElement).cells).forEach((td) => {
      const texto = encabezados[col];
      if (td.tagName === "TD" && texto) td.setAttribute("data-label", texto);
      else td.removeAttribute("data-label");
      col += td.colSpan || 1;
    });
  });
}

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement> & { apilar?: boolean }>(
  ({ className, apilar = true, ...props }, ref) => {
    const propio = React.useRef<HTMLTableElement>(null);
    React.useImperativeHandle(ref, () => propio.current as HTMLTableElement);
    React.useEffect(() => {
      const t = propio.current;
      if (!t || !apilar) return;
      etiquetar(t);
      const obs = new MutationObserver(() => etiquetar(t));
      obs.observe(t, { childList: true, subtree: true });
      return () => obs.disconnect();
    }, [apilar]);
    return (
      <div className="relative w-full overflow-x-auto">
        <table ref={propio} className={cn("w-full caption-bottom text-xs sm:text-sm", apilar && "tabla-apilable", className)} {...props} />
      </div>
    );
  }
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("[&_tr]:border-b bg-piedra-suave/40", className)} {...props} />
  )
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  )
);
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors hover:bg-alba/60 data-[state=selected]:bg-muted", className)}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn("h-9 sm:h-10 px-2 sm:px-3 text-left align-middle font-medium text-muted-foreground whitespace-nowrap", className)}
      {...props}
    />
  )
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-2 sm:px-3 py-2 sm:py-3 align-middle", className)} {...props} />
  )
);
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
