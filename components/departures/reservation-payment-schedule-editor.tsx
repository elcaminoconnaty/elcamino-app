"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEUR, formatDate } from "@/lib/utils";
import { Plus, Trash2, Calendar, CheckCircle2 } from "lucide-react";

export type ScheduleItem = {
  id?: string;
  due_date: string;
  amount_eur: number;
  label: string;
  notes: string;
  paid: boolean;
  paid_at: string | null;
  provider_payment_id: string | null;
};

export function ReservationPaymentScheduleEditor({
  initial,
  totalCost,
  onChange,
}: {
  initial: ScheduleItem[];
  totalCost: number;
  onChange: (items: ScheduleItem[]) => void;
}) {
  const [items, setItems] = React.useState<ScheduleItem[]>(initial);

  React.useEffect(() => {
    setItems(initial);
  }, [initial]);

  function update(next: ScheduleItem[]) {
    setItems(next);
    onChange(next);
  }

  function addItem(preset?: Partial<ScheduleItem>) {
    update([
      ...items,
      {
        due_date: preset?.due_date ?? new Date().toISOString().slice(0, 10),
        amount_eur: preset?.amount_eur ?? 0,
        label: preset?.label ?? "",
        notes: "",
        paid: false,
        paid_at: null,
        provider_payment_id: null,
      },
    ]);
  }

  function removeItem(idx: number) {
    update(items.filter((_, i) => i !== idx));
  }

  function patch(idx: number, p: Partial<ScheduleItem>) {
    update(items.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  }

  function applyPreset(kind: "30_70" | "50_50" | "100") {
    const today = new Date().toISOString().slice(0, 10);
    if (kind === "100") {
      update([{ due_date: today, amount_eur: totalCost, label: "Pago único", notes: "", paid: false, paid_at: null, provider_payment_id: null }]);
    } else if (kind === "30_70") {
      update([
        { due_date: today, amount_eur: Math.round(totalCost * 0.3 * 100) / 100, label: "Anticipo 30%", notes: "", paid: false, paid_at: null, provider_payment_id: null },
        { due_date: today, amount_eur: Math.round(totalCost * 0.7 * 100) / 100, label: "Saldo 70%", notes: "", paid: false, paid_at: null, provider_payment_id: null },
      ]);
    } else if (kind === "50_50") {
      update([
        { due_date: today, amount_eur: Math.round(totalCost * 0.5 * 100) / 100, label: "Anticipo 50%", notes: "", paid: false, paid_at: null, provider_payment_id: null },
        { due_date: today, amount_eur: Math.round(totalCost * 0.5 * 100) / 100, label: "Saldo 50%", notes: "", paid: false, paid_at: null, provider_payment_id: null },
      ]);
    }
  }

  const totalSchedule = items.reduce((s, it) => s + Number(it.amount_eur || 0), 0);
  const diff = totalCost - totalSchedule;

  return (
    <div className="rounded-md border bg-cream-50 p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <Calendar className="h-4 w-4" /> Plan de pagos al proveedor
        </Label>
        <div className="flex gap-1 text-[11px]">
          <button type="button" onClick={() => applyPreset("100")} className="px-2 py-1 rounded bg-white border hover:bg-cream-100">100%</button>
          <button type="button" onClick={() => applyPreset("50_50")} className="px-2 py-1 rounded bg-white border hover:bg-cream-100">50/50</button>
          <button type="button" onClick={() => applyPreset("30_70")} className="px-2 py-1 rounded bg-white border hover:bg-cream-100">30/70</button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">
          Sin plan de pagos. Usá los presets de arriba o agregá cuotas manualmente.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className={`grid grid-cols-12 gap-1.5 items-center rounded-md p-2 ${it.paid ? "bg-green-50 border border-green-200" : "bg-white border"}`}>
              <Input
                type="date"
                value={it.due_date}
                onChange={(e) => patch(i, { due_date: e.target.value })}
                className="col-span-5 sm:col-span-3 h-8 text-xs"
                disabled={it.paid}
              />
              <Input
                placeholder="Ej. Anticipo / Saldo"
                value={it.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                className="col-span-7 sm:col-span-5 h-8 text-xs"
                disabled={it.paid}
              />
              <Input
                type="number"
                step="0.01"
                value={it.amount_eur || ""}
                onChange={(e) => patch(i, { amount_eur: Number(e.target.value) || 0 })}
                className="col-span-10 sm:col-span-3 h-8 text-xs text-right"
                disabled={it.paid}
              />
              <div className="col-span-2 sm:col-span-1 flex justify-end gap-0.5">
                {it.paid ? (
                  <div className="h-7 w-7 flex items-center justify-center text-green-700" title={`Pagada ${it.paid_at ? formatDate(it.paid_at) : ""}`}>
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                ) : (
                  <button type="button" onClick={() => removeItem(i)} className="h-7 w-7 flex items-center justify-center text-red-700 hover:bg-red-50 rounded" title="Eliminar cuota">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
        <button type="button" onClick={() => addItem()} className="text-xs text-camino-deepYellow hover:underline flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" /> Agregar cuota
        </button>
        <div className="text-xs text-muted-foreground">
          Suma cuotas: <strong className="text-foreground">{formatEUR(totalSchedule)}</strong>
          {totalCost > 0 && (
            <> de <strong>{formatEUR(totalCost)}</strong>
              {Math.abs(diff) > 0.01 && (
                <span className={diff > 0 ? "text-amber-700 ml-1" : "text-red-700 ml-1"}>
                  ({diff > 0 ? "falta" : "sobra"} {formatEUR(Math.abs(diff))})
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
