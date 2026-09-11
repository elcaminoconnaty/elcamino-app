"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { formatDate, cn } from "@/lib/utils";
import {
  courseTitle,
  menuIsEmpty,
  emptyGrid,
  gridFromChoices,
  choicesFromGrid,
  reconcileGrid,
  menuSignature,
  dinnerProgress,
  countByOption,
  courseApplies,
  applyChoice,
  type ChoiceGrid,
} from "@/lib/data/menus";
import { useResync } from "@/lib/hooks/use-resync";
import { saveMenusBoard, obtenerEnlaceMenu, enlacesMenuDelCamino, type Dinner } from "@/lib/actions/menus";
import type { PilgrimOf } from "@/lib/data/pilgrims-of";
import { MenuEditor } from "@/components/departures/menu-editor";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eraser,
  Link2,
  Save,
  Undo2,
  UserX,
  UtensilsCrossed,
} from "lucide-react";

type OptOuts = Record<string, Set<string>>;

function etiquetaCena(d: Dinner) {
  return [d.day_number != null ? `Día ${d.day_number}` : null, d.check_in ? formatDate(d.check_in) : null, d.provider_name]
    .filter(Boolean)
    .join(" · ");
}

export function MenusBoard({
  departureId,
  dinners,
  pilgrims,
}: {
  departureId: string;
  dinners: Dinner[];
  pilgrims: PilgrimOf[];
}) {
  const router = useRouter();
  const ids = React.useMemo(() => pilgrims.map((p) => p.id), [pilgrims]);
  const [grid, setGrid] = React.useState<Record<string, ChoiceGrid>>(() =>
    Object.fromEntries(dinners.map((d) => [d.id, gridFromChoices(ids, d.courses, d.choices)]))
  );
  const [optOuts, setOptOuts] = React.useState<OptOuts>(() =>
    Object.fromEntries(dinners.map((d) => [d.id, new Set(d.optOuts)]))
  );
  const [dirty, setDirty] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [copiando, setCopiando] = React.useState(false);
  const [abiertas, setAbiertas] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      dinners.map((d) => {
        const p = dinnerProgress(ids, gridFromChoices(ids, d.courses, d.choices), d.courses, d.optOuts);
        return [d.id, !(p.completos.length > 0 && p.completa)];
      })
    )
  );

  /** Quiénes eligieron por su enlace (para mostrarlo; no es estado editable). */
  const porSuCuenta = React.useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const d of dinners) m[d.id] = new Set(d.choices.filter((c) => c.chosen_via === "peregrino").map((c) => c.pilgrim_id));
    return m;
  }, [dinners]);

  useResync(menuSignature(dinners), () => {
    let perdidas = 0;
    setGrid((prev) => {
      const next: Record<string, ChoiceGrid> = {};
      for (const d of dinners) {
        if (dirty.has(d.id) && prev[d.id]) {
          const r = reconcileGrid(prev[d.id], ids, d.courses);
          next[d.id] = r.grid;
          perdidas += r.perdidas;
        } else {
          next[d.id] = gridFromChoices(ids, d.courses, d.choices);
        }
      }
      return next;
    });
    setOptOuts((prev) => {
      const next: OptOuts = {};
      for (const d of dinners) {
        next[d.id] = dirty.has(d.id) && prev[d.id]
          ? new Set(Array.from(prev[d.id]).filter((id) => ids.includes(id)))
          : new Set(d.optOuts);
      }
      return next;
    });
    setDirty((prev) => new Set(Array.from(prev).filter((id) => dinners.some((d) => d.id === id))));
    if (perdidas > 0) toast({ title: "Cambió el menú", description: `${perdidas} elección(es) sin guardar quedaron sin plato. Revisá antes de guardar.` });
  });

  function marcar(dinnerId: string, next: ChoiceGrid, nextOptOuts?: Set<string>) {
    setGrid((prev) => ({ ...prev, [dinnerId]: next }));
    if (nextOptOuts) setOptOuts((prev) => ({ ...prev, [dinnerId]: nextOptOuts }));
    setDirty((prev) => new Set(prev).add(dinnerId));
  }

  /** Elige un plato; si de esa sección dependen otras, las que dejan de aplicar se vacían. */
  function elegir(d: Dinner, pilgrimId: string, courseId: string, optionId: string) {
    const actual = grid[d.id] ?? {};
    marcar(d.id, { ...actual, [pilgrimId]: applyChoice(actual[pilgrimId] ?? {}, courseId, optionId, d.courses) });
  }

  /** Marca o desmarca "no cena". Si había elegido, se borra en el mismo paso. */
  function toggleOptOut(d: Dinner, pilgrimId: string) {
    const actuales = new Set(optOuts[d.id] ?? []);
    const next: ChoiceGrid = { ...(grid[d.id] ?? {}) };
    if (actuales.has(pilgrimId)) {
      actuales.delete(pilgrimId);
    } else {
      actuales.add(pilgrimId);
      next[pilgrimId] = Object.fromEntries(d.courses.map((c) => [c.id, ""]));
    }
    marcar(d.id, next, actuales);
  }

  function vaciar(d: Dinner) {
    marcar(d.id, emptyGrid(ids, d.courses));
  }

  async function guardar() {
    if (dirty.size === 0) return;
    setSaving(true);
    try {
      const payload = Array.from(dirty).map((id) => {
        const d = dinners.find((x) => x.id === id);
        return {
          reservationId: id,
          choices: choicesFromGrid(grid[id] ?? {}, d?.courses ?? []),
          optOuts: Array.from(optOuts[id] ?? []),
        };
      });
      const r = await saveMenusBoard(departureId, payload);
      if (!r.ok) {
        toast({ title: "No se pudo guardar", description: r.error, variant: "destructive" });
        return;
      }
      setDirty(new Set());
      toast({ title: "Guardado", description: `${payload.length} cena(s) actualizadas`, variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "No se pudo guardar", description: "Se cortó la conexión con el servidor. Revisá internet y volvé a intentar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function copiarEnlace(p: PilgrimOf) {
    try {
      const r = await obtenerEnlaceMenu(p.registration_id);
      if (!r.ok) {
        toast({ title: "No se pudo generar el enlace", description: r.error, variant: "destructive" });
        return;
      }
      await navigator.clipboard.writeText(r.url);
      toast({ title: "Enlace copiado", description: p.full_name, variant: "success" });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  }

  async function copiarTodos() {
    setCopiando(true);
    try {
      const r = await enlacesMenuDelCamino(departureId);
      if (!r.ok) {
        toast({ title: "No se pudieron generar los enlaces", description: r.error, variant: "destructive" });
        return;
      }
      await navigator.clipboard.writeText(r.texto);
      toast({ title: `${r.total} enlaces copiados`, description: "Pegalos en WhatsApp: cada línea es un peregrino.", variant: "success" });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    } finally {
      setCopiando(false);
    }
  }

  const conMenu = dinners.filter((d) => !menuIsEmpty(d.courses));
  const completas = conMenu.filter((d) => dinnerProgress(ids, grid[d.id] ?? {}, d.courses, optOuts[d.id] ?? []).completa).length;

  if (dinners.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Este camino todavía no tiene cenas cargadas. Agregá en <strong>Reservas</strong> una reserva tipo Cenas
          (o marcá "incluye cena" en las habitaciones del hotel) y volvé acá.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className={cn(dirty.size > 0 && "border-ocre border-2")}>
        <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
              <span>
                <strong>{completas}</strong> de {conMenu.length} cenas con menú completas · {pilgrims.length} peregrinos
                {dinners.length > conMenu.length && (
                  <span className="text-muted-foreground"> · {dinners.length - conMenu.length} sin menú cargado</span>
                )}
              </span>
            </div>
            {dirty.size > 0 && <p className="text-xs text-ocre-profundo mt-1">{dirty.size} cena(s) con cambios sin guardar</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={copiarTodos} disabled={copiando || pilgrims.length === 0} title="Un enlace por peregrino, listo para pegar en WhatsApp">
              <Link2 className="h-3.5 w-3.5" /> {copiando ? "Generando…" : "Copiar todos los enlaces"}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/export/caminos/${departureId}/cenas`} download>
                <Download className="h-3.5 w-3.5" /> Excel
              </a>
            </Button>
            <Button onClick={guardar} disabled={saving || dirty.size === 0}>
              <Save className="h-4 w-4" />
              {saving ? "Guardando…" : dirty.size > 0 ? `Guardar ${dirty.size}` : "Guardado"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {dinners.map((d) => {
        const ex = optOuts[d.id] ?? new Set<string>();
        const g = grid[d.id] ?? {};
        const progreso = dinnerProgress(ids, g, d.courses, ex);
        const sinMenu = menuIsEmpty(d.courses);
        const esperados = pilgrims.length - progreso.noCenan.length;
        const abierta = abiertas[d.id];
        const conteo = countByOption(g, d.courses, ex);
        const columnas = d.courses.filter((c) => c.mode !== "en_sitio");
        const otras = dinners
          .filter((o) => o.id !== d.id && !menuIsEmpty(o.courses))
          .map((o) => ({ id: o.id, etiqueta: etiquetaCena(o), courses: o.courses }));

        return (
          <Card key={d.id} className={cn(dirty.has(d.id) && "border-ocre")}>
            <CardContent className="p-0">
              <button
                type="button"
                onClick={() => setAbiertas((p) => ({ ...p, [d.id]: !p[d.id] }))}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {abierta ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {d.day_number != null && <span className="text-muted-foreground mr-1.5">Día {d.day_number}</span>}
                      {d.provider_name}
                      {d.via_rooms && <span className="text-xs text-muted-foreground font-normal ml-1.5">(cena del hotel)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {formatDate(d.check_in)}
                      {d.location ? ` · ${d.location}` : d.provider_city ? ` · ${d.provider_city}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {dirty.has(d.id) && <Badge variant="muted">sin guardar</Badge>}
                  {sinMenu ? (
                    <Badge variant="muted">sin menú</Badge>
                  ) : !progreso.hayQueElegir ? (
                    <span className="text-sm font-medium text-ok-700">
                      menú fijo · {esperados} cenan
                      {progreso.noCenan.length > 0 && (
                        <span className="text-xs text-muted-foreground font-normal"> · {progreso.noCenan.length} no cena{progreso.noCenan.length > 1 ? "n" : ""}</span>
                      )}
                    </span>
                  ) : (
                    <span className={cn("text-sm font-medium", progreso.completa ? "text-ok-700" : progreso.completos.length > 0 ? "text-aviso-700" : "text-muted-foreground")}>
                      {progreso.completos.length}/{esperados} eligieron
                      {progreso.noCenan.length > 0 && (
                        <span className="text-xs text-muted-foreground font-normal"> · {progreso.noCenan.length} no cena{progreso.noCenan.length > 1 ? "n" : ""}</span>
                      )}
                    </span>
                  )}
                </div>
              </button>

              {abierta && (
                <div className="border-t px-4 py-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>
                        {sinMenu
                          ? "Este restaurante todavía no tiene menú cargado."
                          : d.courses
                              .map((c) =>
                                c.mode === "fijo"
                                  ? `${courseTitle(c)}: ${c.options[0]?.name ?? "—"} (todos)`
                                  : c.mode === "en_sitio"
                                    ? `${courseTitle(c)} (en el restaurante)`
                                    : `${courseTitle(c)} (${c.options.length})`
                              )
                              .join(" · ")}
                      </div>
                      {d.menu_notes_pilgrim && <div className="italic">Nota al peregrino: {d.menu_notes_pilgrim}</div>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <MenuEditor
                        reservationId={d.id}
                        departureId={departureId}
                        providerId={d.provider_id}
                        providerName={d.provider_name}
                        courses={d.courses}
                        choices={d.choices}
                        notes={d.menu_notes_pilgrim}
                        otrasCenas={otras}
                      />
                      {!sinMenu && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => vaciar(d)}>
                          <Eraser className="h-3 w-3" /> Vaciar
                        </Button>
                      )}
                    </div>
                  </div>

                  {progreso.noCenan.length > 0 && (
                    <div className="rounded-md border bg-alba/60 px-3 py-2 text-xs text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="text-foreground">No cenan:</strong>
                        {pilgrims.filter((p) => ex.has(p.id)).map((p) => (
                          <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-background border pl-2 pr-1 py-0.5">
                            {p.full_name}
                            <button type="button" onClick={() => toggleOptOut(d, p.id)} title="Deshacer: sí cena" className="inline-flex items-center rounded-full p-0.5 hover:bg-accent/10">
                              <Undo2 className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="py-1.5 pr-2 font-medium">Peregrino</th>
                          {columnas.map((c) => (
                            <th key={c.id} className="py-1.5 pr-2 font-medium whitespace-nowrap">
                              {courseTitle(c)}
                              {c.mode === "fijo" ? <span className="font-normal"> (todos)</span> : !c.required && <span className="font-normal"> (opcional)</span>}
                            </th>
                          ))}
                          <th className="py-1.5 pr-2 font-medium">Alimentación</th>
                          <th className="py-1.5 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pilgrims.map((p) => {
                          const noCena = ex.has(p.id);
                          const fila = g[p.id] ?? {};
                          return (
                            <tr key={p.id} className={cn("border-t", noCena && "text-muted-foreground bg-alba/40")}>
                              <td className="py-1.5 pr-2 whitespace-nowrap">
                                {p.full_name}
                                {p.is_team ? <span className="text-muted-foreground"> (equipo)</span> : ""}
                                {porSuCuenta[d.id]?.has(p.id) && !noCena && (
                                  <span className="ml-1.5 rounded-full bg-ok-50 text-ok-700 px-1.5 py-0.5 text-[10px]" title="Eligió desde su enlace">por su cuenta</span>
                                )}
                              </td>
                              {columnas.map((c) => {
                                if (c.mode === "fijo") {
                                  return (
                                    <td key={c.id} className="py-1 pr-2 text-muted-foreground whitespace-nowrap">{noCena ? "" : c.options[0]?.name ?? "—"}</td>
                                  );
                                }
                                if (!courseApplies(c, fila, d.courses)) {
                                  return <td key={c.id} className="py-1 pr-2 text-muted-foreground text-center">—</td>;
                                }
                                return (
                                  <td key={c.id} className="py-1 pr-2">
                                    <select
                                      value={fila[c.id] ?? ""}
                                      disabled={noCena}
                                      onChange={(e) => elegir(d, p.id, c.id, e.target.value)}
                                      className="h-8 w-full min-w-[120px] rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
                                    >
                                      <option value="">— sin elegir —</option>
                                      {c.options.map((o) => (
                                        <option key={o.id} value={o.id}>{o.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                );
                              })}
                              <td className="py-1.5 pr-2 max-w-[160px] truncate" title={p.dietary_notes ?? ""}>
                                {p.dietary_notes ?? ""}
                              </td>
                              <td className="py-1 whitespace-nowrap">
                                <div className="flex items-center gap-0.5 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => toggleOptOut(d, p.id)}
                                    title={noCena ? "Sí cena" : "No cena esta noche"}
                                    className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 hover:bg-accent/10", noCena && "text-foreground")}
                                  >
                                    {noCena ? <Undo2 className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                                    <span className="text-[10px]">{noCena ? "sí cena" : "no cena"}</span>
                                  </button>
                                  <button type="button" onClick={() => copiarEnlace(p)} title="Copiar su enlace para elegir" className="inline-flex items-center rounded-md p-1 hover:bg-accent/10">
                                    <Copy className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {conteo.length > 0 && (
                    <div className="rounded-md border bg-alba/40 px-3 py-2 text-xs">
                      <strong>Para el restaurante:</strong>{" "}
                      {conteo.map((x) => `${x.n} ${x.option.name}${x.todos ? " (todos)" : ""}`).join(" · ")}
                    </div>
                  )}

                  <div className="pt-1">
                    <Button asChild variant="ghost" size="sm">
                      <a href={`/api/export/caminos/${departureId}/cenas?restaurante=${d.provider_id}`} download>
                        <Download className="h-3 w-3" /> Excel solo de {d.provider_name}
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
