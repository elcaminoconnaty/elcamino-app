"use client";
import * as React from "react";
import { EurCop } from "@/components/ui/eur-cop";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

export type NetoLineItem = {
  source: "por_pagante" | "reservation";
  label: string;
  perPerson: number;
  detail?: string;
  totalCost?: number;
  beds?: number;
  reservationId?: string;
  duplicate?: boolean;
};

export type NetoCategory = {
  category: string;
  total: number;
  items: NetoLineItem[];
  duplicatesIgnored: number;
};

export function PerPilgrimCostBreakdown({ categories, total }: { categories: NetoCategory[]; total: number }) {
  // Por default todas las categorías están expandidas — el usuario pidió ver qué se está sumando.
  // El click colapsa/expande individualmente.
  const allCats = React.useMemo(() => categories.map((c) => c.category), [categories]);
  const [open, setOpen] = React.useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const cat of allCats) init[cat] = true;
    return init;
  });

  React.useEffect(() => {
    // Cuando cambia la lista de categorías (ej. después de revalidar), volver a abrir las nuevas.
    setOpen((prev) => {
      const next = { ...prev };
      for (const cat of allCats) if (!(cat in next)) next[cat] = true;
      return next;
    });
  }, [allCats]);

  if (categories.length === 0) {
    return <div className="text-center py-4 text-muted-foreground text-sm">Cargá reservas y items por peregrino para ver el cálculo.</div>;
  }

  return (
    <div className="space-y-2">
      {categories.map((c) => {
        const isOpen = open[c.category] !== false;
        return (
          <div key={c.category} className="text-sm border border-piedra rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen((prev) => ({ ...prev, [c.category]: !isOpen }))}
              className="w-full flex items-center justify-between gap-2 py-2 px-3 bg-alba/60 hover:bg-piedra-suave text-left transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className="font-medium text-foreground">{c.category}</span>
                <span className="text-xs text-muted-foreground">({c.items.filter((i) => !i.duplicate).length})</span>
                {c.duplicatesIgnored > 0 && (
                  <span title={`${c.duplicatesIgnored} items duplicados ignorados`} className="inline-flex items-center gap-0.5 text-aviso-700 text-[10px]">
                    <AlertTriangle className="h-3 w-3" /> {c.duplicatesIgnored} dup
                  </span>
                )}
              </span>
              <span className="shrink-0 font-medium"><EurCop value={c.total} /></span>
            </button>
            {isOpen && (
              <div className="px-3 py-2 space-y-1.5 text-xs bg-background">
                {c.items.map((it, idx) => (
                  <div key={idx} className={`flex items-start justify-between gap-3 py-1 ${idx < c.items.length - 1 ? "border-b border-piedra-suave" : ""} ${it.duplicate ? "opacity-50" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="break-words">
                        {it.duplicate && <span className="text-aviso-700 mr-1" title="Duplicado ignorado">⚠</span>}
                        <span className={it.duplicate ? "line-through" : ""}>{it.label}</span>
                      </div>
                      {it.detail && <div className="text-muted-foreground text-[10px] mt-0.5">{it.detail}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-medium ${it.duplicate ? "line-through text-muted-foreground" : ""}`}>
                        <EurCop value={it.perPerson} />
                      </div>
                      {it.source === "reservation" && it.totalCost != null && it.beds != null && (
                        <div className="text-muted-foreground text-[10px] mt-0.5">
                          {it.totalCost.toLocaleString("es-ES", { maximumFractionDigits: 2 })} € ÷ {it.beds} {it.beds === 1 ? "cama" : "camas"}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {c.duplicatesIgnored > 0 && (
                  <div className="text-[10px] text-aviso-700 pt-1 mt-1 border-t border-piedra-suave">
                    ⚠ {c.duplicatesIgnored} item{c.duplicatesIgnored > 1 ? "s" : ""} duplicado{c.duplicatesIgnored > 1 ? "s" : ""} apunta{c.duplicatesIgnored > 1 ? "n" : ""} a la misma reserva — los ignoramos para no doble-contar. Revisalos en la pestaña Presupuesto y borralos.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div className="border-t pt-3 mt-3 flex justify-between font-semibold text-sm">
        <span>Total NETO por peregrino</span>
        <span><EurCop value={total} /></span>
      </div>
    </div>
  );
}
