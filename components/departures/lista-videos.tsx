"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Copy, ExternalLink, Eye, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { numeroWhatsApp } from "@/components/pilgrims/pasos-bienvenida";
import { marcarVideoEnviado } from "@/lib/actions/videos";

export type FilaVideo = {
  registrationId: string;
  pilgrimId: string;
  nombreCompleto: string;
  nombre: string;
  telefono: string | null;
  video: {
    id: string;
    url: string;
    minutos: number;
    enviado: string | null;
    primeraVista: string | null;
    ultimaVista: string | null;
    vistas: number;
  } | null;
};

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : null;

function mensaje(nombre: string, url: string) {
  return `Hola ${nombre} 💛\n\nHay personas que caminan contigo aunque no estén aquí, y te dejaron un mensaje. Es solo para ti:\n${url}\n\nBúscate un momento tranquilo, sube el volumen y ábrelo con calma.\n\nNati & Nico`;
}

export function ListaVideos({ filas }: { filas: FilaVideo[] }) {
  const router = useRouter();
  const [ocupado, empezar] = useTransition();

  function marcar(id: string, enviado: boolean) {
    empezar(async () => {
      const r = await marcarVideoEnviado(id, enviado);
      if (!r.ok) toast({ title: "No se pudo marcar", description: r.error, variant: "destructive" });
      router.refresh();
    });
  }

  function whatsapp(f: FilaVideo) {
    if (!f.video) return;
    const numero = numeroWhatsApp(f.telefono);
    window.open(`https://wa.me/${numero ?? ""}?text=${encodeURIComponent(mensaje(f.nombre, f.video.url))}`, "_blank");
    if (numero) marcar(f.video.id, true);
    else toast({ title: "No tiene un celular válido en su ficha", description: "Elige su chat en WhatsApp y, cuando lo mandes, toca «ya lo mandé».", variant: "destructive" });
  }

  async function copiar(f: FilaVideo) {
    if (!f.video) return;
    try {
      await navigator.clipboard.writeText(mensaje(f.nombre, f.video.url));
      toast({ title: "Mensaje copiado", description: `Con el enlace privado de ${f.nombre}.`, variant: "success" });
    } catch (err: any) {
      toast({ title: "No se pudo copiar", description: err?.message, variant: "destructive" });
    }
  }

  return (
    <ul className="divide-y">
      {filas.map((f) => {
        const v = f.video;
        const estado = !v
          ? { texto: "Sin video", clase: "text-muted-foreground" }
          : v.vistas
            ? { texto: `Visto${v.vistas > 1 ? ` ${v.vistas} veces` : ""} · ${fecha(v.primeraVista)}`, clase: "text-ok-700" }
            : v.enviado
              ? { texto: `Enviado · ${fecha(v.enviado)}, sin ver`, clase: "text-aviso-800" }
              : { texto: "Por enviar", clase: "text-muted-foreground" };
        return (
          <li key={f.registrationId} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <Link href={`/peregrinos/${f.pilgrimId}`} className="text-sm font-medium text-noche hover:underline">{f.nombreCompleto}</Link>
              <div className={`text-xs mt-0.5 flex items-center gap-1.5 ${estado.clase}`}>
                {v?.vistas ? <Eye className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
                {estado.texto}
                {v && <span className="text-muted-foreground">· {v.minutos} min</span>}
              </div>
            </div>
            {v && (
              <div className="flex gap-1.5 flex-wrap items-center">
                <Button size="sm" variant={v.enviado ? "outline" : "accent"} disabled={ocupado} onClick={() => whatsapp(f)} title="Abre su chat con el mensaje y su enlace privado">
                  <MessageCircle className="h-4 w-4" /> {v.enviado ? "Reenviar" : "Enviar por WhatsApp"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copiar(f)} title="Copiar el mensaje con su enlace">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button asChild size="sm" variant="ghost" title="Ver su página tal como la ve (tus vistas no se cuentan)">
                  <a href={`${v.url}?vista=equipo`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                </Button>
                <button type="button" disabled={ocupado} onClick={() => marcar(v.id, !v.enviado)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground ml-1">
                  {v.enviado ? "desmarcar" : "ya lo mandé"}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
