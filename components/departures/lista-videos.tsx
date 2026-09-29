"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Copy, ExternalLink, Eye, Film, Send, Check, SkipForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { numeroWhatsApp } from "@/components/pilgrims/pasos-bienvenida";
import { marcarVideoEnviado, guardarCelular } from "@/lib/actions/videos";

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

/** Para quien no tiene celular en su ficha: se escribe ahí mismo y entra a la serie. */
function CampoCelular({ pilgrimId, nombre }: { pilgrimId: string; nombre: string }) {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [ocupado, empezar] = useTransition();
  function guardar(e: React.FormEvent) {
    e.preventDefault();
    empezar(async () => {
      const r = await guardarCelular(pilgrimId, valor);
      if (!r.ok) toast({ title: "No se pudo guardar", description: r.error, variant: "destructive" });
      else { toast({ title: `Celular de ${nombre} guardado`, variant: "success" }); router.refresh(); }
    });
  }
  return (
    <form onSubmit={guardar} className="flex w-full gap-1.5">
      <input
        type="tel"
        inputMode="tel"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={`Celular de ${nombre} (con +52, +1… si no es de Colombia)`}
        className="min-w-0 flex-1 h-9 rounded-md border border-input bg-background px-3 text-base sm:text-sm"
      />
      <Button type="submit" size="sm" variant="outline" disabled={ocupado || !valor.trim()} className="h-9">Guardar</Button>
    </form>
  );
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

  // «Enviar a todos»: WhatsApp no deja mandar solo desde un número personal, así que va en
  // serie. Cada toque abre el chat con el mensaje listo; al volver, la tarjeta ya muestra al
  // siguiente. Quien no tiene celular en su ficha no entra en la serie (no hay a quién abrirle).
  const cola = filas.filter((f) => f.video && !f.video.enviado && numeroWhatsApp(f.telefono));
  const sinCelular = filas.filter((f) => f.video && !f.video.enviado && !numeroWhatsApp(f.telefono));
  const [serie, setSerie] = useState<FilaVideo[] | null>(null);
  const [paso, setPaso] = useState(0);
  const actual = serie?.[paso] ?? null;

  function enviarActual() {
    if (!actual?.video) return;
    const numero = numeroWhatsApp(actual.telefono);
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje(actual.nombre, actual.video.url))}`, "_blank");
    marcarVideoEnviado(actual.video.id, true).then((r) => {
      if (!r.ok) toast({ title: `No se pudo marcar a ${actual.nombre}`, description: r.error, variant: "destructive" });
    });
    setPaso((p) => p + 1);
  }

  function cerrarSerie() {
    setSerie(null);
    setPaso(0);
    router.refresh();
  }

  return (
    <>
    {serie ? (
      <div className="mb-4 rounded-xl border-2 border-ocre bg-ocre/10 p-4 sm:p-5">
        {actual ? (
          <>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{paso + 1} de {serie.length}</span>
              <button type="button" onClick={cerrarSerie} className="inline-flex items-center gap-1 hover:text-foreground"><X className="h-3.5 w-3.5" /> Terminar</button>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-background overflow-hidden">
              <div className="h-full bg-ocre transition-all" style={{ width: `${(paso / serie.length) * 100}%` }} />
            </div>
            {paso > 0 && <p className="mt-3 text-sm text-ok-700 flex items-center gap-1.5"><Check className="h-4 w-4" /> Listo {serie[paso - 1].nombre}. Sigue:</p>}
            <p className="font-display text-2xl text-noche mt-2">{actual.nombreCompleto}</p>
            <Button variant="accent" className="mt-3 w-full h-12 text-base" onClick={enviarActual}>
              <MessageCircle className="h-5 w-5" /> Abrir WhatsApp de {actual.nombre}
            </Button>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Toca enviar en WhatsApp y vuelve aquí.</span>
              <button type="button" onClick={() => setPaso((p) => p + 1)} className="inline-flex items-center gap-1 hover:text-foreground"><SkipForward className="h-3.5 w-3.5" /> Saltar</button>
            </div>
          </>
        ) : (
          <div className="text-center py-2">
            <p className="font-display text-2xl text-noche">¡Listo! 💛</p>
            <p className="text-sm text-muted-foreground mt-1">Se abrieron los {serie.length} chats.</p>
            <Button variant="outline" className="mt-3" onClick={cerrarSerie}>Cerrar</Button>
          </div>
        )}
      </div>
    ) : (cola.length > 0 || sinCelular.length > 0) && (
      <div className="mb-4 rounded-xl border bg-background p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="text-sm">
          <p className="font-medium text-noche">{cola.length ? `${cola.length} por enviar` : "Nadie más con celular por enviar"}</p>
          {sinCelular.length > 0 && (
            <p className="text-xs text-aviso-800 mt-0.5">Sin celular en su ficha: {sinCelular.map((f) => f.nombre).join(", ")}</p>
          )}
        </div>
        {cola.length > 0 && (
          <Button variant="accent" className="h-11 w-full sm:w-auto" onClick={() => { setSerie(cola); setPaso(0); }}>
            <Send className="h-4 w-4" /> Enviar a todos
          </Button>
        )}
      </div>
    )}
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
            {v && !f.telefono && <CampoCelular pilgrimId={f.pilgrimId} nombre={f.nombre} />}
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
    </>
  );
}
