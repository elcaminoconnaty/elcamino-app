"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import {
  COURSE_LABELS, COURSE_MODE_LABELS, COURSE_ORDER, copyMenu, courseTitle,
  type CourseKind, type CourseMode, type MenuCourse, type MenuInput,
} from "@/lib/data/menus";
import { setReservationMenu, setMenuNotes, ultimoMenuDelRestaurante, type MenuAnterior } from "@/lib/actions/menus";
import { ClipboardList, Copy, Plus, X } from "lucide-react";

type OptionRow = { key: string; id?: string; name: string; description: string };
type CourseRow = {
  key: string;
  id?: string;
  course: CourseKind;
  label: string;
  required: boolean;
  mode: CourseMode;
  /** Clave de la fila del plato del que depende, o "" si no depende de nada. */
  dependsOnKey: string;
  options: OptionRow[];
};

let seq = 0;
const nuevaKey = () => `k${++seq}`;

function filasDesde(courses: MenuCourse[], conIds: boolean): CourseRow[] {
  const rows = courses.map((c) => ({
    key: nuevaKey(),
    id: conIds ? c.id : undefined,
    course: c.course,
    label: c.label ?? "",
    required: c.required,
    mode: c.mode ?? "peregrino",
    dependsOnKey: "",
    _dependsOnId: c.depends_on_option_id ?? null,
    options: c.options.map((o) => ({ key: nuevaKey(), id: conIds ? o.id : undefined, _srcId: o.id, name: o.name, description: o.description ?? "" })),
  }));
  // La dependencia se guarda por id en la base; acá se traduce a la clave de la fila.
  const keyPorId = new Map<string, string>();
  for (const r of rows) for (const o of r.options) keyPorId.set(o._srcId, o.key);
  return rows.map(({ _dependsOnId, options, ...r }) => ({
    ...r,
    dependsOnKey: _dependsOnId ? keyPorId.get(_dependsOnId) ?? "" : "",
    options: options.map(({ _srcId, ...o }) => o),
  }));
}

function nuevaOpcion(): OptionRow {
  return { key: nuevaKey(), name: "", description: "" };
}

const AYUDA_MODO: Record<CourseMode, string> = {
  peregrino: "Cada peregrino elige uno de estos platos desde su enlace.",
  fijo: "Va igual para todos. Se le manda al restaurante con el total de comensales; el peregrino solo lo ve.",
  en_sitio: "Se decide en la mesa. No se le manda nada al restaurante ni se le pregunta al peregrino.",
};

/**
 * El menú de una cena: secciones (entrada, fuerte, postre, bebida…) con sus platos.
 * Cada sección dice cómo se elige (el peregrino, igual para todos, o en el restaurante)
 * y puede depender de una opción anterior ("Primero" solo si eligió "Menú completo").
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
  notes,
  otrasCenas,
  trigger,
}: {
  reservationId: string;
  departureId: string;
  providerId: string;
  providerName: string;
  courses: MenuCourse[];
  /** Las elecciones ya guardadas: sirven para avisar cuántas se pierden al borrar un plato. */
  choices: { option_id: string; course_id: string }[];
  /** Nota que ve el peregrino arriba del menú. */
  notes: string | null;
  otrasCenas: { id: string; etiqueta: string; courses: MenuCourse[] }[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<CourseRow[]>(() => filasDesde(courses, true));
  const [nota, setNota] = React.useState(notes ?? "");
  const [saving, setSaving] = React.useState(false);
  const [anterior, setAnterior] = React.useState<MenuAnterior | null | undefined>(undefined);
  const [confirmar, setConfirmar] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setRows(filasDesde(courses, true));
    setNota(notes ?? "");
    setConfirmar(false);
    if (anterior === undefined) {
      ultimoMenuDelRestaurante(providerId, reservationId).then(setAnterior).catch(() => setAnterior(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Elecciones que se pierden: platos quitados, o secciones que dejan de elegirse. */
  const perdidas = React.useMemo(() => {
    const quedan = new Set(rows.filter((c) => c.mode === "peregrino").flatMap((c) => c.options.map((o) => o.id).filter(Boolean)));
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
  function cambiarModo(key: string, mode: CourseMode) {
    setRows((prev) => {
      const padre = prev.find((c) => c.key === key);
      if (!padre) return prev;
      const keysMias = new Set(padre.options.map((o) => o.key));
      return prev.map((c) => {
        if (c.key === key) {
          let options = c.options;
          if (mode === "fijo") options = c.options.length ? c.options.slice(0, 1) : [nuevaOpcion()];
          if (mode === "en_sitio") options = [];
          if (mode === "peregrino" && options.length === 0) options = [nuevaOpcion()];
          return { ...c, mode, options, required: mode === "peregrino" ? c.required : false };
        }
        // Nada puede depender de una sección que ya no elige el peregrino.
        if (mode !== "peregrino" && keysMias.has(c.dependsOnKey)) return { ...c, dependsOnKey: "" };
        return c;
      });
    });
  }
  function quitarSeccion(key: string) {
    setRows((prev) => {
      const s = prev.find((c) => c.key === key);
      const keys = new Set(s?.options.map((o) => o.key) ?? []);
      return prev.filter((x) => x.key !== key).map((c) => (keys.has(c.dependsOnKey) ? { ...c, dependsOnKey: "" } : c));
    });
  }
  function quitarPlato(ck: string, ok: string) {
    setRows((prev) => prev.map((c) => (c.key === ck ? { ...c, options: c.options.filter((x) => x.key !== ok) } : c)).map((c) => (c.dependsOnKey === ok ? { ...c, dependsOnKey: "" } : c)));
  }
  function agregarSeccion(course: CourseKind) {
    setRows((prev) => [
      ...prev,
      { key: nuevaKey(), course, label: "", required: course !== "bebida", mode: "peregrino", dependsOnKey: "", options: [nuevaOpcion()] },
    ]);
  }
  function cargar(desde: MenuCourse[]) {
    const copia = copyMenu(desde);
    setRows(filasDesde(copia.map((c, i) => ({
      id: `tmp${i}`, course: c.course, label: c.label ?? null, position: i, required: c.required,
      mode: c.mode ?? "peregrino",
      depends_on_option_id: c.depends_on ? `tmp${c.depends_on.course_index}-${c.depends_on.option_index}` : null,
      options: c.options.map((o, j) => ({ id: `tmp${i}-${j}`, name: o.name, description: o.description ?? null, position: j })),
    })), false));
  }

  /** Las opciones de las que puede depender la sección `idx`: las de secciones anteriores que elige el peregrino. */
  function padresPosibles(idx: number) {
    const out: { key: string; etiqueta: string }[] = [];
    rows.slice(0, idx).forEach((c) => {
      if (c.mode !== "peregrino") return;
      for (const o of c.options) if (o.name.trim()) out.push({ key: o.key, etiqueta: `${courseTitle({ course: c.course, label: c.label })}: ${o.name.trim()}` });
    });
    return out;
  }

  async function guardar() {
    if (perdidas > 0 && !confirmar) {
      setConfirmar(true);
      return;
    }
    // Se filtran las secciones y platos vacíos ANTES de calcular los índices de dependencia.
    const limpias = rows
      .map((c) => ({
        ...c,
        options: c.mode === "en_sitio" ? [] : c.options.filter((o) => o.name.trim()),
      }))
      .filter((c) => c.mode === "en_sitio" || c.options.length > 0);
    const menu: MenuInput = limpias.map((c) => {
      let depends_on: { course_index: number; option_index: number } | null = null;
      if (c.dependsOnKey) {
        const ci = limpias.findIndex((x) => x.options.some((o) => o.key === c.dependsOnKey));
        if (ci >= 0) depends_on = { course_index: ci, option_index: limpias[ci].options.findIndex((o) => o.key === c.dependsOnKey) };
      }
      return {
        id: c.id,
        course: c.course,
        label: c.label.trim() || null,
        required: c.required,
        mode: c.mode,
        depends_on,
        options: c.options.map((o) => ({ id: o.id, name: o.name.trim(), description: o.description.trim() || null })),
      };
    });
    setSaving(true);
    try {
      const r = await setReservationMenu(reservationId, menu, departureId);
      if (!r.ok) {
        toast({ title: "No se pudo guardar el menú", description: r.error, variant: "destructive" });
        return;
      }
      if ((nota.trim() || "") !== (notes ?? "").trim()) {
        const n = await setMenuNotes(reservationId, nota, departureId);
        if (!n.ok) toast({ title: "El menú se guardó, pero no la nota", description: n.error, variant: "destructive" });
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
            Cada sección dice cómo se decide: la elige el peregrino, va igual para todos, o se elige en el restaurante.
            Una sección puede depender de una opción anterior (p. ej. &quot;Primero&quot; solo si eligió &quot;Menú completo&quot;).
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

        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">Nota para los peregrinos (la ven arriba del menú)</label>
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            className="text-xs min-h-[56px]"
            placeholder="Ej.: La cena tiene tres platos; el postre se elige en el restaurante. Bebidas incluidas: agua y vino."
          />
        </div>

        <div className="space-y-3">
          {rows.map((c, idx) => {
            const padres = padresPosibles(idx);
            return (
              <div key={c.key} className="rounded-md border p-3 space-y-2 bg-background">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-32">
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
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-[10px] text-muted-foreground">Rótulo (opcional)</label>
                    <Input value={c.label} onChange={(e) => patch(c.key, { label: e.target.value })} placeholder={courseTitle({ course: c.course })} className="h-9 text-xs" />
                  </div>
                  <div className="w-44">
                    <label className="text-[10px] text-muted-foreground">Cómo se decide</label>
                    <select
                      value={c.mode}
                      onChange={(e) => cambiarModo(c.key, e.target.value as CourseMode)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {(Object.keys(COURSE_MODE_LABELS) as CourseMode[]).map((m) => (
                        <option key={m} value={m}>{COURSE_MODE_LABELS[m]}</option>
                      ))}
                    </select>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => quitarSeccion(c.key)} title="Quitar sección">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{AYUDA_MODO[c.mode]}</span>
                  {c.mode === "peregrino" && (
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer text-foreground">
                      <input type="checkbox" checked={c.required} onChange={(e) => patch(c.key, { required: e.target.checked })} />
                      obligatoria
                    </label>
                  )}
                </div>

                {padres.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted-foreground whitespace-nowrap">Solo si eligió</label>
                    <select
                      value={c.dependsOnKey}
                      onChange={(e) => patch(c.key, { dependsOnKey: e.target.value })}
                      className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="">— siempre —</option>
                      {padres.map((p) => (
                        <option key={p.key} value={p.key}>{p.etiqueta}</option>
                      ))}
                    </select>
                  </div>
                )}

                {c.mode !== "en_sitio" && (
                  <div className="space-y-1.5">
                    {c.options.map((o) => (
                      <div key={o.key} className="flex gap-1.5 items-center">
                        <Input
                          value={o.name}
                          onChange={(e) => patchOp(c.key, o.key, { name: e.target.value })}
                          placeholder={c.mode === "fijo" ? "Plato para todos" : "Plato"}
                          className="h-8 text-xs flex-1"
                        />
                        <Input value={o.description} onChange={(e) => patchOp(c.key, o.key, { description: e.target.value })} placeholder="Detalle (opcional)" className="h-8 text-xs flex-1" />
                        {c.mode === "peregrino" && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => quitarPlato(c.key, o.key)} title="Quitar plato">
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {c.mode === "peregrino" && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => patch(c.key, { options: [...c.options, nuevaOpcion()] })}>
                        <Plus className="h-3 w-3" /> Plato
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {COURSE_ORDER.map((k) => (
            <Button key={k} type="button" variant="outline" size="sm" onClick={() => agregarSeccion(k)}>
              <Plus className="h-3 w-3" /> {COURSE_LABELS[k]}
            </Button>
          ))}
        </div>

        {perdidas > 0 && (
          <p className="text-xs rounded-md bg-aviso-50 text-aviso-900 p-2">
            Se van a perder <strong>{perdidas}</strong> elección(es) de peregrinos que habían elegido un plato que estás
            quitando o pasando a &quot;igual para todos&quot;. {confirmar ? "Tocá Guardar otra vez para confirmar." : ""}
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
