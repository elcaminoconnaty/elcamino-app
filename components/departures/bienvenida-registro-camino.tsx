"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, FileSpreadsheet, FileText, AlertTriangle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { guardarAjustesCarta } from "@/lib/actions/registro";
import { CopiarEnlaceRegistro } from "@/components/departures/registro-controles";

/**
 * Bienvenida y registro, a nivel de camino: cuánto va, la carta sin nombre para revisarla,
 * el Excel con todo lo que llenaron y lo único de la carta que no sale de la ruta (dónde y
 * a qué hora es el encuentro). La carta y el formulario de cada uno se mandan desde su tarjeta.
 */
export function BienvenidaRegistroCamino(props: {
  departureId: string;
  total: number;
  cartas: number;
  formulariosEnviados: number;
  formulariosLlenos: number;
  conProblemas: number;
  ajustes: { encuentro_lugar: string; encuentro_hora: string };
  pendientesCarta: string[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [aj, setAj] = useState(props.ajustes);
  const [guardando, empezar] = useTransition();

  function guardar() {
    empezar(async () => {
      const r = await guardarAjustesCarta(props.departureId, aj);
      if (!r.ok) return toast({ title: "No se pudo guardar", description: r.error, variant: "destructive" });
      toast({ title: "Carta actualizada", description: "Todas las cartas de este camino ya salen con el cambio.", variant: "success" });
      setEditando(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Mail className="h-4 w-4 text-muted-foreground" /> Bienvenida y registro
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
            <span>Cartas enviadas <strong className="text-foreground">{props.cartas}/{props.total}</strong></span>
            <span>Formularios enviados <strong className="text-foreground">{props.formulariosEnviados}/{props.total}</strong></span>
            <span>Llenos <strong className="text-foreground">{props.formulariosLlenos}/{props.total}</strong></span>
            {props.conProblemas > 0 && <span className="text-error-700">Pasaportes por corregir <strong>{props.conProblemas}</strong></span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/export/caminos/${props.departureId}/registro`} download title="Todo lo que llenaron, las tallas para el kit, la alimentación y lo que falta">
              <FileSpreadsheet className="h-4 w-4" /> Registro (Excel)
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/pdf/bienvenida/camino/${props.departureId}`} target="_blank" title="La carta sin nombre, para revisarla o mandarla al grupo">
              <FileText className="h-4 w-4" /> Carta del camino
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditando((v) => !v)}>
            <MapPin className="h-4 w-4" /> Lugar del encuentro
          </Button>
          <CopiarEnlaceRegistro departureId={props.departureId} />
        </div>

        {editando && (
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end rounded-md border bg-muted/40 p-3">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Dónde es el encuentro</span>
              <input value={aj.encuentro_lugar} onChange={(e) => setAj({ ...aj, encuentro_lugar: e.target.value })} placeholder="Estación Chamartín, Madrid" className="h-8 w-full rounded border bg-background px-2 text-sm" />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Hora (si ya se sabe)</span>
              <input value={aj.encuentro_hora} onChange={(e) => setAj({ ...aj, encuentro_hora: e.target.value })} placeholder="hora exacta a confirmar 20 días antes" className="h-8 w-full rounded border bg-background px-2 text-sm" />
            </label>
            <Button size="sm" variant="accent" disabled={guardando} onClick={guardar}>Guardar</Button>
            <p className="text-[11px] text-muted-foreground sm:col-span-3">
              Las fechas, las etapas, los kilómetros y el ritual de cierre salen solos de la ruta y de las fechas del camino.
            </p>
          </div>
        )}

        {props.pendientesCarta.map((p) => (
          <p key={p} className="text-xs flex gap-2 items-start text-aviso-800">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Carta: {p}</span>
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
