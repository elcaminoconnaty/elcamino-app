"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import {
  COURSE_LABELS, COURSE_ORDER, copyMenu, courseTitle,
  type CourseKind, type MenuCourse, type MenuInput,
} from "@/lib/data/menus";
import { setReservationMenu, ultimoMenuDelRestaurante, type MenuAnterior } from "@/lib/actions/menus";
import { ClipboardList, Copy, Plus, X } from "lucide-react";

type OptionRow = { key: string; id?: string; name: string; description: string };
type CourseRow = { key: string; id?: string; course: CourseKind; label: string; required: boolean; options: OptionRow[] };

let seq = 0;
const nuevaKey = () => `k${++seq}`;

function filasDesde(courses: MenuCourse[], conIds: boolean): CourseRow[] {
  return courses.map((c) => ({
    key: nuevaKey(),
    id: conIds ? c.id : undefined,
    course: c.course,
    label: c.label ?? "",
    required: c.required,
    options: c.options.map((o) => ({ key: nuevaKey(), id: conIds ? o.id : undefined, name: o.name, description: o.description ?? "" })),
  }));
}

/**
 * El menú de una cena: secciones (entrada, fuerte, postre, bebida) con sus platos.
 * Se puede arrancar copiando el de la última vez que se reservó en el mismo
 * restaurante, o el de otra cena de este camino.
 */
export function MenuEditor({
  reservationId,
  departureId,
  providerId,
  providerName,
  courses,
  choices,
  otrasCenas,
  trigger,
}: {
  reservationId: string;
  departureId: string;
  providerId: string;
  providerName: string;
  courses: MenuCourse[];
  /** Las elecciones ya guardadas: sirven para avisar cuántas se pierden al borrar un plato. */
  choices: { option_id: string }[];
  otrasCenas: { id: string; etiqueta: string; courses: MenuCourse[] }[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<CourseRow[]>(() => filasDesde(courses, true));
  const [saving, setSaving] = React.useState(false);
  const [anterior, setAnterior] = React.useState<MenuAnterior | null | undefined>(undefined);
  const [confirmar, setConfirmar] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setRows(filasDesde(courses, true));
    setConfirmar(false);
    if (anterior === undefined) {
      ultimoMenuDelRestaurante(providerId, reservationId).then(setAnterior).catch(() => setAnterior(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const perdidas = React.useMemo(() => {
    const quedan = new Set(rows.flatMap((c) => c.options.map((o) => o.id).filter(Boolean)));
    return choices.filter((ch) => !quedan.has(ch.option_id)).length;
  }, [rows, choices]);

  function patch(key: string, cambio: Partial<CourseRow>) {
    setRows((prev) => prev.map((c) => (c.key === key ? { ...c, ...cambio } : c)));
  }
  function patchOp(ck: string, ok: string, cambio: Partial<OptionRow>) {
    setRows((prev) =>
      prev.map((c) => (c.key === ck ? { ...c, options: c.options.map((o) => (o.key === ok ? { ...o, ...cambio } : o)) } : c))
    );
  }
  function agregarSeccion(course: CourseKind) {
    setRows((prev) => [
      ...prev,
      { key: nuevaKey(), course, label: "", required: course !== "bebida", options: [{ key: nuevaKey(), name: "", description: "" }] },
    ]);
  }
  function cargar(desde: MenuCourse[]) {
    setRows(filasDesde(copyMenu(desde).map((c, i) => ({
      id: `tmp${i}`, course: c.course, label: c.label ?? null, position: i, required: c.required,
      options: c.options.map((o, j) => ({ id: `tmp${i}-${j}`, name: o.name, description: o.description ?? null, position: j })),
    })), false));
  }

  async function guardar() {
    if (perdidas > 0 && !confirmar) {
      setConfirmar(true);
      return;
    }
    const menu: MenuInput = rows
      .map((c) => ({
        id: c.id,
        course: c.course,
        label: c.label.trim() || null,
        required: c.required,
        options: c.options.filter((o) => o.name.trim()).map((o) => ({ id: o.id, name: o.name.trim(), description: o.description.trim() || null })),
      }))
      .filter((c) => c.options.length > 0);
    setSaving(true);
    try {
      const r = await setReservationMenu(reservationId, menu, departureId);
      if (!r.ok) {
        toast({ title: "No se pudo guardar el menú", description: r.error, variant: "destructive" });
        return;
      }
      toast({ title: "Menú guardado", description: providerName, variant: "success" });
      setOpen(false);
      router.refresh();
    } catch {
      toast({ title: "No se pudo guardar el menú", description: "Se cortó la conexión. Volvé a intentar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const vacio = rows.length === 0;
  const usadas = new Set(rows.map((r) => r.course));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm">
            <ClipboardList className="h-3 w-3" /> Menú
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Menú de {providerName}</DialogTitle>
          <DialogDescription>
            Lo que el restaurante ofrece para elegir. Lo normal es entrada, plato fuerte, postre y bebida; si solo
            mandan platos fuertes, cargá solo esa sección.
          </DialogDescription>
        </DialogHeader>

        {vacio && (anterior || otrasCenas.length > 0) && (
          <div className="rounded-md border bg-alba/60 p-3 text-xs space-y-2">
            <div className="font-medium">Arrancar desde un menú que ya existe</div>
            <div className="flex flex-wrap gap-1.5">
              {anterior && (
                <Button type="button" variant="outline" size="sm" onClick={() => cargar(anterior.courses)}>
                  <Copy className="h-3 w-3" /> Copiar el de la última vez ({anterior.etiqueta})
                </Button>
              )}
              {otrasCenas.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const src = otrasCenas.find((o) => o.id === e.target.value);
                    if (src) cargar(src.courses);
                    e.target.value = "";
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">Copiar de otra cena de este camino…</option>
                  {otrasCenas.map((o) => (
                    <option key={o.id} value={o.id}>{o.etiqueta}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {rows.map((c) => (
            <div key={c.key} className="rounded-md border p-3 space-y-2 bg-background">
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-36">
                  <label className="text-[10px] text-muted-foreground">Sección</label>
                  <select
                    value={c.course}
                    onChange={(e) => patch(c.key, { course: e.target.value as CourseKind })}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {COURSE_ORDER.map((k) => (
                      <option key={k} value={k}>{COURSE_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-[10px] text-muted-foreground">Rótulo (opcional)</label>
                  <Input value={c.label} onChange={(e) => patch(c.key, { label: e.target.value })} placeholder={courseTitle({ course: c.course })} className="h-9 text-xs" />
                </div>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer pb-2">
                  <input type="checkbox" checked={c.required} onChange={(e) => patch(c.key, { required: e.target.checked })} />
                  obligatoria
                </label>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRows((p) => p.filter((x) => x.key !== c.key))} title="Quitar sección">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="space-y-1.5">
                {c.options.map((o) => (
                  <div key={o.key} className="flex gap-1.5 items-center">
                    <Input value={o.name} onChange={(e) => patchOp(c.key, o.key, { name: e.target.value })} placeholder="Plato" className="h-8 text-xs flex-1" />
                    <Input value={o.description} onChange={(e) => patchOp(c.key, o.key, { description: e.target.value })} placeholder="Detalle (opcional)" className="h-8 text-xs flex-1" />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => patch(c.key, { options: c.options.filter((x) => x.key !== o.key) })} title="Quitar plato">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => patch(c.key, { options: [...c.options, { key: nuevaKey(), name: "", description: "" }] })}>
                  <Plus className="h-3 w-3" /> Plato
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {COURSE_ORDER.map((k) => (
            <Button key={k} type="button" variant="outline" size="sm" onClick={() => agregarSeccion(k)} disabled={usadas.has(k) && k !== "otro"}>
              <Plus className="h-3 w-3" /> {COURSE_LABELS[k]}
            </Button>
          ))}
        </div>

        {perdidas > 0 && (
          <p className="text-xs rounded-md bg-aviso-50 text-aviso-900 p-2">
            Se van a perder <strong>{perdidas}</strong> elección(es) de peregrinos que habían elegido un plato que estás
            quitando. {confirmar ? "Tocá Guardar otra vez para confirmar." : ""}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" variant="accent" onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : perdidas > 0 && confirmar ? "Guardar igual" : "Guardar menú"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
