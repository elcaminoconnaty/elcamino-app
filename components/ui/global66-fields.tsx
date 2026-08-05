"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GLOBAL66 } from "@/lib/constants";
import { global66Rate } from "@/lib/global66";
import { formatCOP, formatEUR } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

export function formatRate(rate: number | null | undefined) {
  if (rate == null) return "—";
  return `${Number(rate).toLocaleString("es-CO", { maximumFractionDigits: 2 })} COP/EUR`;
}

/**
 * Bloque de conversión de Global 66: la peregrina paga en COP y a la cuenta
 * entran euros a la tasa de Global 66 (con su comisión incluida), que no es la
 * TRM del día. Naty carga los euros reales que muestra la app y de ahí sale la tasa.
 */
export function Global66Fields({
  amountCop,
  eur,
  onEurChange,
  marketTrm,
  direction = "in",
  trmInputName,
}: {
  amountCop: number;
  eur: string;
  onEurChange: (v: string) => void;
  marketTrm?: number | null;
  /** "in": entra plata (cobro a peregrino). "out": sale plata (pago a proveedor/gasto). */
  direction?: "in" | "out";
  /** Si el formulario se envía con FormData, nombre del input oculto con la tasa. */
  trmInputName?: string;
}) {
  const eurNum = Number(eur);
  const rate = global66Rate(amountCop, eurNum);
  const market = marketTrm ? Number(marketTrm) : 0;
  const diffPct = rate && market > 0 ? ((rate - market) / market) * 100 : null;

  return (
    <div className="rounded-md border border-camino-yellow bg-cream-50 p-3 space-y-2">
      <div className="text-xs font-medium flex items-center gap-1.5">
        {GLOBAL66} · cambio COP <ArrowRight className="h-3 w-3" /> EUR
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">
          {direction === "in" ? `Euros que entraron a ${GLOBAL66} *` : `Euros que salieron de ${GLOBAL66} *`}
        </Label>
        <Input
          type="number"
          step="0.01"
          value={eur}
          onChange={(e) => onEurChange(e.target.value)}
          placeholder="Los euros exactos que muestra Global 66"
        />
      </div>
      {trmInputName && <input type="hidden" name={trmInputName} value={rate ?? ""} />}

      {rate ? (
        <div className="text-xs space-y-0.5">
          <div>
            {formatCOP(amountCop)} <span className="text-muted-foreground">→</span>{" "}
            <strong>{formatEUR(eurNum)}</strong>
          </div>
          <div className="text-muted-foreground">
            Tasa aplicada: {formatRate(rate)}
            {diffPct != null && (
              <>
                {" · "}
                {diffPct >= 0 ? "+" : ""}
                {diffPct.toLocaleString("es-CO", { maximumFractionDigits: 1 })}% vs. TRM del día (
                {market.toLocaleString("es-CO", { maximumFractionDigits: 0 })})
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-amber-700">
          Cargá el monto en COP y los euros recibidos para calcular la tasa de {GLOBAL66}.
        </p>
      )}
    </div>
  );
}
