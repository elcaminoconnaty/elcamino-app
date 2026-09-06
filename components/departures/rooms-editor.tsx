"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROOM_TYPE_DEFAULTS, ROOM_TYPE_LABELS, type RoomInput, type RoomType } from "@/lib/data/rooms";
import { formatEUR } from "@/lib/utils";
import { Plus, X } from "lucide-react";

type RowState = {
  room_type: RoomType;
  rooms_count: string;
  capacity_per_room: string;
  price_per_room_eur: string;
  includes_breakfast: boolean;
  breakfast_per_person_eur: string;
  includes_dinner: boolean;
  dinner_per_person_eur: string;
  extra_per_person_eur: string;
  notes: string;
};

export function RoomsEditor({
  initial,
  onChange,
}: {
  initial?: any[];
  onChange: (rooms: RoomInput[], totals: { beds: number; cost: number }) => void;
}) {
  const [rows, setRows] = React.useState<RowState[]>(() =>
    (initial ?? []).map((r) => ({
      room_type: r.room_type,
      rooms_count: String(r.rooms_count),
      capacity_per_room: String(r.capacity_per_room),
      price_per_room_eur: String(r.price_per_room_eur),
      includes_breakfast: !!r.includes_breakfast,
      breakfast_per_person_eur: String(r.breakfast_per_person_eur ?? 0),
      includes_dinner: !!r.includes_dinner,
      dinner_per_person_eur: String(r.dinner_per_person_eur ?? 0),
      extra_per_person_eur: String(r.extra_per_person_eur ?? 0),
      notes: r.notes ?? "",
    }))
  );

  const totals = React.useMemo(() => {
    let beds = 0;
    let cost = 0;
    for (const r of rows) {
      const rc = Number(r.rooms_count) || 0;
      const cap = Number(r.capacity_per_room) || 0;
      const pr = Number(r.price_per_room_eur) || 0;
      const br = r.includes_breakfast ? Number(r.breakfast_per_person_eur) || 0 : 0;
      const dn = r.includes_dinner ? Number(r.dinner_per_person_eur) || 0 : 0;
      const ex = Number(r.extra_per_person_eur) || 0;
      beds += rc * cap;
      cost += rc * pr + rc * cap * (br + dn + ex);
    }
    return { beds, cost };
  }, [rows]);

  React.useEffect(() => {
    const payload: RoomInput[] = rows.map((r) => ({
      room_type: r.room_type,
      rooms_count: Number(r.rooms_count) || 0,
      capacity_per_room: Number(r.capacity_per_room) || 0,
      price_per_room_eur: Number(r.price_per_room_eur) || 0,
      includes_breakfast: r.includes_breakfast,
      breakfast_per_person_eur: Number(r.breakfast_per_person_eur) || 0,
      includes_dinner: r.includes_dinner,
      dinner_per_person_eur: Number(r.dinner_per_person_eur) || 0,
      extra_per_person_eur: Number(r.extra_per_person_eur) || 0,
      notes: r.notes || null,
    }));
    onChange(payload, totals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function addRow(type: RoomType = "doble") {
    setRows([
      ...rows,
      {
        room_type: type,
        rooms_count: "1",
        capacity_per_room: String(ROOM_TYPE_DEFAULTS[type]),
        price_per_room_eur: "0",
        includes_breakfast: false,
        breakfast_per_person_eur: "0",
        includes_dinner: false,
        dinner_per_person_eur: "0",
        extra_per_person_eur: "0",
        notes: "",
      },
    ]);
  }

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        if (patch.room_type && patch.room_type !== r.room_type) {
          next.capacity_per_room = String(ROOM_TYPE_DEFAULTS[patch.room_type]);
        }
        return next;
      })
    );
  }

  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2 rounded-md border bg-alba/40 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Habitaciones</Label>
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">{totals.beds}</span> plazas · <strong>{formatEUR(totals.cost)}</strong>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="text-xs text-muted-foreground py-2">
          Sin habitaciones desglosadas. Agregá una o más con los botones de abajo. El sistema calcula plazas y costo total automáticamente.
        </div>
      )}

      <div className="space-y-3">
        {rows.map((r, idx) => {
          const rc = Number(r.rooms_count) || 0;
          const cap = Number(r.capacity_per_room) || 0;
          const personas = rc * cap;
          const br = r.includes_breakfast ? Number(r.breakfast_per_person_eur) || 0 : 0;
          const dn = r.includes_dinner ? Number(r.dinner_per_person_eur) || 0 : 0;
          const ex = Number(r.extra_per_person_eur) || 0;
          const subtotal = rc * (Number(r.price_per_room_eur) || 0) + personas * (br + dn + ex);
          return (
            <div key={idx} className="rounded-md bg-background border p-2.5 space-y-2">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-3">
                  <Label className="text-[10px] text-muted-foreground">Tipo</Label>
                  <select
                    value={r.room_type}
                    onChange={(e) => updateRow(idx, { room_type: e.target.value as RoomType })}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {(Object.entries(ROOM_TYPE_LABELS) as [RoomType, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <Label className="text-[10px] text-muted-foreground">N°</Label>
                  <Input type="number" min={1} value={r.rooms_count} onChange={(e) => updateRow(idx, { rooms_count: e.target.value })} className="h-9 text-xs" />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Capacidad</Label>
                  <Input type="number" min={1} value={r.capacity_per_room} onChange={(e) => updateRow(idx, { capacity_per_room: e.target.value })} className="h-9 text-xs" />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Label className="text-[10px] text-muted-foreground">€ habitación</Label>
                  <Input type="number" step="0.01" value={r.price_per_room_eur} onChange={(e) => updateRow(idx, { price_per_room_eur: e.target.value })} className="h-9 text-xs" />
                </div>
                <div className="col-span-9 sm:col-span-3 text-xs text-muted-foreground">
                  {personas} plaza{personas !== 1 ? "s" : ""}<br/><strong className="text-foreground">{formatEUR(subtotal)}</strong>
                </div>
                <div className="col-span-3 sm:col-span-1 flex justify-end">
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(idx)} className="h-8 w-8">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end pt-1 border-t">
                <div className="col-span-2 sm:col-span-1">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={r.includes_breakfast} onChange={(e) => updateRow(idx, { includes_breakfast: e.target.checked })} />
                    <span>Incluye desayuno</span>
                  </label>
                  {r.includes_breakfast && (
                    <Input type="number" step="0.01" value={r.breakfast_per_person_eur} onChange={(e) => updateRow(idx, { breakfast_per_person_eur: e.target.value })} className="h-8 text-xs mt-1" placeholder="€ / persona" />
                  )}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={r.includes_dinner} onChange={(e) => updateRow(idx, { includes_dinner: e.target.checked })} />
                    <span>Incluye cena</span>
                  </label>
                  {r.includes_dinner && (
                    <Input type="number" step="0.01" value={r.dinner_per_person_eur} onChange={(e) => updateRow(idx, { dinner_per_person_eur: e.target.value })} className="h-8 text-xs mt-1" placeholder="€ / persona" />
                  )}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-[10px] text-muted-foreground">Otros extras / persona</Label>
                  <Input type="number" step="0.01" value={r.extra_per_person_eur} onChange={(e) => updateRow(idx, { extra_per_person_eur: e.target.value })} className="h-8 text-xs" placeholder="ej. traslado" />
                </div>
              </div>

              <Input value={r.notes} onChange={(e) => updateRow(idx, { notes: e.target.value })} placeholder="Notas (ej. confirmado por Marisa, código reserva, etc.)" className="h-8 text-xs" />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => addRow("doble")}><Plus className="h-3 w-3" /> Doble</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRow("triple")}><Plus className="h-3 w-3" /> Triple</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRow("cuadruple")}><Plus className="h-3 w-3" /> Cuádruple</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRow("individual")}><Plus className="h-3 w-3" /> Individual</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRow("grupal")}><Plus className="h-3 w-3" /> Grupal</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRow("otro")}><Plus className="h-3 w-3" /> Otro</Button>
      </div>
    </div>
  );
}
