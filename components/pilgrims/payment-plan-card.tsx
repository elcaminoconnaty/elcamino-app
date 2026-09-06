"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { setPaymentPlan, type InstallmentInput } from "@/lib/actions/payment-plans";
import { createClient } from "@/lib/supabase/client";
import { formatEUR, formatDate } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { CalendarClock, Plus, X, Check } from "lucide-react";

type Inst = {
  id?: string;
  label: string;
  due_date: string;
  amount_eur: string;
  status: string;
};

export function PaymentPlanCard({ registrationId, totalEur, departureStartDate }: { registrationId: string; totalEur: number; departureStartDate: string | null }) {
  const [installments, setInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("v_installment_status")
        .select("*")
        .eq("registration_id", registrationId)
        .order("position", { ascending: true });
      // amount_eur = monto programado, para compatibilidad con el editor del plan
      setInstallments((data ?? []).map((r: any) => ({ ...r, amount_eur: r.scheduled_amount_eur })));
      setLoading(false);
    })();
  }, [registrationId]);

  if (loading) return null;

  if (installments.length === 0) {
    return (
      <div className="border-t pt-3">
        <PaymentPlanDialog
          registrationId={registrationId}
          totalEur={totalEur}
          departureStartDate={departureStartDate}
          current={[]}
          trigger={
            <Button variant="ghost" size="sm" className="w-full text-xs">
              <CalendarClock className="h-3.5 w-3.5" /> Definir plan de pagos
            </Button>
          }
        />
      </div>
    );
  }

  const totalPlan = installments.reduce((s, i) => s + Number(i.amount_eur), 0);
  const paidCount = installments.filter((i) => i.status === "pagada").length;
  return (
    <div className="border-t pt-3 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium uppercase tracking-wider text-muted-foreground">Plan de pagos</span>
        <PaymentPlanDialog
          registrationId={registrationId}
          totalEur={totalEur}
          departureStartDate={departureStartDate}
          current={installments}
          trigger={<button className="text-ocre-profundo hover:underline">Editar</button>}
        />
      </div>
      <div className="text-xs text-muted-foreground">{paidCount}/{installments.length} cuotas pagadas · {formatEUR(totalPlan)}</div>
      <div className="space-y-1">
        {installments.map((i) => {
          const isPaid = i.status === "pagada";
          const isOverdue = i.status === "vencida";
          const isPartial = !isPaid && Number(i.remaining_eur) < Number(i.scheduled_amount_eur) - 0.005;
          return (
            <div key={i.id} className="flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {isPaid ? (
                  <Check className="h-3.5 w-3.5 text-ok-700 shrink-0" />
                ) : (
                  <div className={`h-2 w-2 rounded-full shrink-0 ${isOverdue ? "bg-error-500" : "bg-ocre"}`} />
                )}
                <span className="truncate">
                  {i.label || `Cuota ${i.position}`} · {formatDate(i.due_date)}
                  {isPartial && <span className="text-muted-foreground"> · faltan {formatEUR(i.remaining_eur)}</span>}
                </span>
              </div>
              <span className={isPaid ? "line-through text-muted-foreground shrink-0" : isOverdue ? "text-error-700 font-medium shrink-0" : "shrink-0"}>{formatEUR(i.amount_eur)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PaymentPlanDialog({
  registrationId,
  totalEur,
  departureStartDate,
  current,
  trigger,
}: {
  registrationId: string;
  totalEur: number;
  departureStartDate: string | null;
  current: any[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Inst[]>(
    current.length > 0
      ? current.map((i) => ({
          id: i.id,
          label: i.label ?? "",
          due_date: i.due_date,
          amount_eur: String(i.amount_eur),
          status: i.status,
        }))
      : []
  );
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const total = rows.reduce((s, r) => s + (Number(r.amount_eur) || 0), 0);
  const diff = totalEur - total;

  function add() {
    const defaultDate = departureStartDate
      ? new Date(new Date(departureStartDate).getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    setRows([...rows, { label: "", due_date: defaultDate, amount_eur: "", status: "pendiente" }]);
  }

  function remove(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }

  function update(idx: number, key: keyof Inst, value: string) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  }

  function suggestSplit(parts: number, percentages?: number[]) {
    if (!departureStartDate) {
      toast({ title: "Falta fecha de salida para sugerir", variant: "destructive" });
      return;
    }
    const start = new Date(departureStartDate);
    const pcts = percentages ?? Array(parts).fill(100 / parts);
    const newRows: Inst[] = [];
    for (let i = 0; i < parts; i++) {
      const offsetDays = Math.round((parts - i - 1) * 60 + 30);
      const d = new Date(start.getTime() - offsetDays * 24 * 3600 * 1000);
      newRows.push({
        label: `Cuota ${i + 1} (${pcts[i].toFixed(0)}%)`,
        due_date: d.toISOString().slice(0, 10),
        amount_eur: ((totalEur * pcts[i]) / 100).toFixed(2),
        status: "pendiente",
      });
    }
    setRows(newRows);
  }

  async function save() {
    setSaving(true);
    try {
      const installments: InstallmentInput[] = rows.map((r) => ({
        label: r.label || null,
        due_date: r.due_date,
        amount_eur: Number(r.amount_eur) || 0,
        status: r.status,
      }));
      await setPaymentPlan(registrationId, installments);
      toast({ title: "Plan de pagos guardado", variant: "success" });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plan de pagos</DialogTitle>
          <DialogDescription>
            Total acordado: <strong>{formatEUR(totalEur)}</strong>. Agregá las cuotas con monto y fecha.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground self-center mr-1">Sugerencias:</span>
          <Button type="button" variant="outline" size="sm" onClick={() => suggestSplit(3, [30, 30, 40])}>30 / 30 / 40</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => suggestSplit(2, [50, 50])}>50 / 50</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => suggestSplit(4, [25, 25, 25, 25])}>25 x 4</Button>
        </div>

        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {rows.length === 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground">No hay cuotas. Tocá una sugerencia o "+ Agregar cuota".</div>
          )}
          {rows.map((r, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <Input
                className="col-span-5"
                placeholder={`Cuota ${idx + 1}`}
                value={r.label}
                onChange={(e) => update(idx, "label", e.target.value)}
              />
              <Input
                className="col-span-3"
                type="date"
                value={r.due_date}
                onChange={(e) => update(idx, "due_date", e.target.value)}
              />
              <Input
                className="col-span-3"
                type="number"
                step="0.01"
                placeholder="Monto EUR"
                value={r.amount_eur}
                onChange={(e) => update(idx, "amount_eur", e.target.value)}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)} className="col-span-1 h-8 w-8">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Agregar cuota
        </Button>

        <div className={`text-sm rounded-md p-2 ${Math.abs(diff) < 0.01 ? "bg-ok-50 text-ok-900" : "bg-aviso-50 text-aviso-900"}`}>
          Total del plan: <strong>{formatEUR(total)}</strong>
          {Math.abs(diff) >= 0.01 && (
            <> · diferencia con total acordado: <strong>{formatEUR(diff)}</strong></>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="accent" onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar plan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
