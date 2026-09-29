import { Card, CardContent } from "@/components/ui/card";
import { EurCop } from "@/components/ui/eur-cop";
import type { DepartureFinance } from "@/lib/finance";
import { TrendingUp, TrendingDown } from "lucide-react";

/** Lo contratado con proveedores (lib/data/costos-contratados.ts). */
type Contratado = { comprometido: number; pagado: number; falta: number } | null;

export function MoneyPanorama({
  finance: f,
  contratado,
  capacity,
}: {
  finance: DepartureFinance;
  contratado: Contratado;
  capacity: number | null;
}) {
  const pagantes = f.pagantes_count;
  const capacityProgress = capacity && capacity > 0
    ? Math.min(100, Math.round((pagantes / capacity) * 100))
    : 0;

  const esperado = Number(f.expected_revenue_eur ?? 0);
  const cobrado = Number(f.collected_revenue_eur ?? 0);
  // Con la tasa de cierre fijada, lo que falta cobrar sale de la liquidación
  // (abonos en pesos re-valorados); antes de eso, del pendiente histórico. En un
  // camino sin recálculo no hay tasa de cierre y el pendiente ya es el definitivo.
  const hayCierre = (f.settlement_mode ?? "recalculo") === "recalculo" && Number(f.trm_frozen_value ?? 0) > 0;
  const faltaCobrar = Number(f.pending_settled_eur ?? 0);
  const porDevolver = Number(f.por_devolver_eur ?? 0);
  const difCambio = Number(f.fx_difference_eur ?? 0);
  const cobradoPct = esperado > 0 ? Math.min(100, Math.round((cobrado / esperado) * 100)) : 0;

  // Dos costos con nombre propio (decisión de Nico, 2026-09-29):
  //  · "Costo con los inscritos": el de la utilidad; sigue a la gente que va, porque las camas
  //    sobrantes se cancelan a tiempo (para eso están las alertas).
  //  · "Comprometido hoy": lo contratado, el peor caso si no se inscribe nadie más.
  // Pagado y falta por pagar salen de lo contratado: es lo que se le debe a cada proveedor, y así
  // cuadran con las filas de la pestaña Pagos y con el informe de giros.
  const costo = Number(f.costo_total_eur ?? 0);
  const comprometido = Number(contratado?.comprometido ?? 0);
  const pagado = Number(contratado?.pagado ?? 0);
  const faltaPagar = Number(contratado?.falta ?? 0);
  const pagadoBase = pagado + faltaPagar;
  const pagadoPct = pagadoBase > 0 ? Math.min(100, Math.round((pagado / pagadoBase) * 100)) : 0;

  const utilPositive = Number(f.utilidad_total_eur ?? 0) >= 0;

  return (
    <div className="space-y-3">
      {/* Tira superior: inscritos + utilidad */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <Card className="border-ocre border-2">
          <CardContent className="p-3 sm:p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Peregrinos inscritos</div>
              <div className="text-xl sm:text-2xl font-display font-semibold mt-1">
                {pagantes}{capacity ? <span className="text-muted-foreground text-base"> / {capacity}</span> : null}
              </div>
              <div className="text-xs text-muted-foreground">+ {f.team_count} equipo</div>
            </div>
            {capacity ? (
              <div className="w-24 shrink-0">
                <div className="h-1.5 bg-piedra-suave rounded-full overflow-hidden">
                  <div className="h-full bg-ocre" style={{ width: `${capacityProgress}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground text-right mt-1">{capacityProgress}% del cupo</div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className={utilPositive ? "border-ok-200 border-2" : "border-error-200 border-2"}>
          <CardContent className="p-3 sm:p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Utilidad proyectada</div>
            <div className={`text-xl sm:text-2xl font-display font-semibold mt-1 ${utilPositive ? "text-ok-700" : "text-error-700"}`}>
              <EurCop value={f.utilidad_total_eur} />
            </div>
            <div className="text-xs text-muted-foreground"><EurCop value={f.utilidad_por_pagante_eur} /> por peregrino · ingresos − costo total</div>
          </CardContent>
        </Card>
      </div>

      {/* Dos lados: lo que entra vs lo que sale */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
        {/* ENTRA */}
        <Card className="border-ok-200 border-2">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-ok-900">
              <TrendingUp className="h-4 w-4" /> Lo que entra — peregrinos
            </div>
            {/* En el celular van de a dos: en cuatro columnas las cifras se cortaban ("EUR 31.8…"). */}
            <div className={`mt-3 grid gap-x-2 gap-y-3 grid-cols-2 ${hayCierre ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              <MoneyCell label="Esperado" value={<EurCop value={esperado} />} />
              <MoneyCell label="Cobrado" value={<EurCop value={cobrado} />} strong="text-ok-700" />
              <MoneyCell
                label={hayCierre ? "Falta (liquidado)" : "Falta por cobrar"}
                value={<EurCop value={faltaCobrar} />}
                strong="text-aviso-700"
              />
              {hayCierre && (
                <MoneyCell label="Por devolver" value={<EurCop value={porDevolver} />} strong="text-info-800" />
              )}
            </div>
            <div className="mt-3 h-2 bg-piedra-suave rounded-full overflow-hidden">
              <div className="h-full bg-ok-500" style={{ width: `${cobradoPct}%` }} />
            </div>
            <div className="text-[10px] text-muted-foreground text-right mt-1 flex justify-between">
              {hayCierre && Math.abs(difCambio) > 0.5 ? (
                <span className={difCambio > 0 ? "text-error-700" : "text-ok-700"}>
                  dif. en cambio {difCambio > 0 ? "−" : "+"}
                  <EurCop value={Math.abs(difCambio)} hideZeroCop />
                </span>
              ) : <span />}
              <span>{cobradoPct}% cobrado</span>
            </div>
          </CardContent>
        </Card>

        {/* SALE */}
        <Card className="border-aviso-200 border-2">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-aviso-900">
              <TrendingDown className="h-4 w-4" /> Lo que sale — proveedores + equipo
            </div>
            <div className="mt-3 grid gap-x-2 gap-y-3 grid-cols-2 sm:grid-cols-4">
              <MoneyCell label="Costo con los inscritos" value={<EurCop value={costo} />} />
              <MoneyCell label="Comprometido hoy" value={<EurCop value={comprometido} />} />
              <MoneyCell label="Pagado" value={<EurCop value={pagado} />} strong="text-ok-700" />
              <MoneyCell label="Falta por pagar" value={<EurCop value={faltaPagar} />} strong="text-aviso-700" />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              «Comprometido hoy» es lo contratado y presupuestado con proveedores (el peor caso si no se inscribe nadie más).
              Falta por pagar sale de ahí.
            </p>
            <div className="mt-3 h-2 bg-piedra-suave rounded-full overflow-hidden">
              <div className="h-full bg-aviso-500" style={{ width: `${pagadoPct}%` }} />
            </div>
            <div className="text-[10px] text-muted-foreground text-right mt-1">{pagadoPct}% pagado</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MoneyCell({ label, value, strong }: { label: string; value: React.ReactNode; strong?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</div>
      <div className={`text-base sm:text-lg font-display font-semibold mt-0.5 break-words sm:truncate ${strong ?? ""}`}>{value}</div>
    </div>
  );
}
