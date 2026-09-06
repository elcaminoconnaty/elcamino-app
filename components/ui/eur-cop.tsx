"use client";
import * as React from "react";
import { formatEUR, formatCOP } from "@/lib/utils";

const TrmContext = React.createContext<{
  trm: number;
  setTrm: (v: number) => void;
  defaultTrm: number;
}>({ trm: 0, setTrm: () => {}, defaultTrm: 0 });

export function TrmProvider({ defaultTrm, children }: { defaultTrm: number; children: React.ReactNode }) {
  const [trm, setTrm] = React.useState<number>(defaultTrm || 0);
  // Sync con cambios externos (ej. el server actualiza)
  React.useEffect(() => { setTrm(defaultTrm || 0); }, [defaultTrm]);
  return (
    <TrmContext.Provider value={{ trm, setTrm, defaultTrm }}>
      {children}
    </TrmContext.Provider>
  );
}

export function useTrm() {
  return React.useContext(TrmContext);
}

export function EurCop({ value, className, hideZeroCop }: { value: number | null | undefined; className?: string; hideZeroCop?: boolean }) {
  const { trm } = useTrm();
  if (value == null) return <span className={className}>—</span>;
  const eur = Number(value);
  const cop = trm > 0 ? eur * trm : 0;
  return (
    <span className={className}>
      <span>{formatEUR(eur)}</span>
      {trm > 0 && (!hideZeroCop || cop !== 0) && (
        <span className="text-[0.85em] text-muted-foreground ml-1">· {formatCOP(cop)}</span>
      )}
    </span>
  );
}

export function TrmSelector({ small }: { small?: boolean }) {
  const { trm, setTrm, defaultTrm } = useTrm();
  const [editing, setEditing] = React.useState(false);
  const isOverride = Math.abs(trm - defaultTrm) > 0.01;

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1">
        <input
          type="number"
          step="0.01"
          value={trm}
          onChange={(e) => setTrm(Number(e.target.value) || 0)}
          className="h-7 w-24 rounded-md border border-input bg-background px-2 text-xs"
          autoFocus
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") setEditing(false);
          }}
        />
        <button onClick={() => { setTrm(defaultTrm); setEditing(false); }} className="text-xs text-muted-foreground hover:underline">reset</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs ${isOverride ? "bg-aviso-100 text-aviso-900" : "bg-piedra-suave text-muted-foreground hover:bg-piedra"} ${small ? "" : "h-7"}`}
      title={isOverride ? "TRM editada — toca para ajustar o reset" : "TRM actual — toca para simular otra"}
    >
      <span>1 € = {trm > 0 ? trm.toLocaleString("es-CO") : "—"} COP</span>
      {isOverride && <span>✎</span>}
    </button>
  );
}
