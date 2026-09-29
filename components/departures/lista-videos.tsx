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
  return `Hola ${nombre} 💛\n\nHay personas que caminan contigo aunque no estén aquí, y te dejaron un mensaje. Es solo para ti:\n${url}\n\nBúscate un momento tranquilo, sube el volumen y ábrelo con calma (si puedes, con wifi: es un video largo).\n\nNati & Nico`;
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
    // No se marca al abrir: abrir WhatsApp no es enviar. Se marca con «ya lo mandé».
    toast({ title: numero ? `Cuando le llegue a ${f.nombre}, toca «ya lo mandé»` : "No tiene un celular válido en su ficha", description: numero ? undefined : "Elige su chat en WhatsApp y, cuando lo mandes, toca «ya lo mandé».", variant: numero ? "default" : "destructive" });
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
  // serie. Cada persona son dos toques: abrir su chat (con el mensaje listo) y, de vuelta,
  // confirmar que se envió. Solo la confirmación la marca como enviada: abrir WhatsApp no es
  // enviar, y si el celular recarga la app a mitad de camino, quien no se confirmó sigue en
  // la cola. Quien no tiene celular en su ficha no entra (no hay a quién abrirle).
  //
  // El ensayo hace la misma serie pero todo va al número de quien prueba, con enlaces que no
  // suman vistas (?vista=equipo), y no marca nada: sirve para ver en el iPhone que WhatsApp
  // abre bien, que el texto sale completo y que cada enlace abre el video de esa persona.
  const cola = filas.filter((f) => f.video && !f.video.enviado && numeroWhatsApp(f.telefono));
  const conVideo = filas.filter((f) => f.video);
  const sinCelular = filas.filter((f) => f.video && !f.video.enviado && !numeroWhatsApp(f.telefono));
  const [serie, setSerie] = useState<FilaVideo[] | null>(null);
  const [paso, setPaso] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [ensayo, setEnsayo] = useState<string | null>(null);
  const [numeroEnsayo, setNumeroEnsayo] = useState(() => {
    try { return localStorage.getItem("videos-ensayo-numero") ?? ""; } catch { return ""; }
  });
  const [pidiendoNumero, setPidiendoNumero] = useState(false);
  const actual = serie?.[paso] ?? null;

  function abrirActual() {
    if (!actual?.video) return;
    const destino = ensayo ?? numeroWhatsApp(actual.telefono);
    const url = ensayo ? `${actual.video.url}?vista=equipo` : actual.video.url;
    const texto = (ensayo ? `[ENSAYO · para ${actual.nombreCompleto}]\n\n` : "") + mensaje(actual.nombre, url);
    window.open(`https://wa.me/${destino}?text=${encodeURIComponent(texto)}`, "_blank");
    setAbierto(true);
  }

  function confirmarActual() {
    if (!actual?.video) return;
    if (!ensayo) {
      const quien = actual;
      marcarVideoEnviado(quien.video!.id, true).then((r) => {
        if (!r.ok) toast({ title: `No se pudo marcar a ${quien.nombre}`, description: `${r.error}. Márcalo a mano con «ya lo mandé».`, variant: "destructive" });
      });
    }
    setAbierto(false);
    setPaso((p) => p + 1);
  }

  function empezarEnsayo() {
    const n = numeroWhatsApp(numeroEnsayo);
    if (!n) { toast({ title: "Ese número no sirve para WhatsApp", description: "Escríbelo con los 10 dígitos (o con +52, +1… si no es de Colombia).", variant: "destructive" }); return; }
    try { localStorage.setItem("videos-ensayo-numero", numeroEnsayo); } catch {}
    setEnsayo(n);
    setPidiendoNumero(false);
    setSerie(conVideo);
    setPaso(0);
    setAbierto(false);
  }

  function cerrarSerie() {
    setSerie(null);
    setEnsayo(null);
    setPaso(0);
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
    {serie ? (
      <div className={`mb-4 rounded-xl border-2 p-4 sm:p-5 ${ensayo ? "border-atlantico bg-atlantico/10" : "border-ocre bg-ocre/10"}`}>
        {ensayo && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-atlantico">Ensayo · todo te llega a ti, nada se marca</p>}
        {actual ? (
          <>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{paso + 1} de {serie.length}</span>
              <button type="button" onClick={cerrarSerie} className="inline-flex items-center gap-1 hover:text-foreground"><X className="h-3.5 w-3.5" /> Terminar</button>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-background overflow-hidden">
              <div className="h-full bg-ocre transition-all" style={{ width: `${(paso / serie.length) * 100}%` }} />
            </div>
            {paso > 0 && !abierto && <p className="mt-3 text-sm text-ok-700 flex items-center gap-1.5"><Check className="h-4 w-4" /> Listo {serie[paso - 1].nombre}. Sigue:</p>}
            <p className="font-display text-2xl text-noche mt-2">{actual.nombreCompleto}</p>
            {!abierto ? (
              <Button variant="accent" className="mt-3 w-full h-12 text-base" onClick={abrirActual}>
                <MessageCircle className="h-5 w-5" /> Abrir WhatsApp {ensayo ? "(ensayo)" : `de ${actual.nombre}`}
              </Button>
            ) : (
              <>
                <p className="mt-2 text-sm text-noche">¿{ensayo ? "Te llegó" : `Le llegó a ${actual.nombre}`} el mensaje en WhatsApp?</p>
                <Button variant="accent" className="mt-2 w-full h-12 text-base" onClick={confirmarActual}>
                  <Check className="h-5 w-5" /> Sí, enviado · siguiente
                </Button>
                <Button variant="outline" className="mt-2 w-full h-11" onClick={abrirActual}>
                  <MessageCircle className="h-4 w-4" /> No, abrir WhatsApp otra vez
                </Button>
              </>
            )}
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{abierto ? "Solo cuenta como enviado si tocas «Sí»." : "Toca enviar en WhatsApp y vuelve aquí."}</span>
              <button type="button" onClick={() => { setAbierto(false); setPaso((p) => p + 1); }} className="inline-flex items-center gap-1 hover:text-foreground"><SkipForward className="h-3.5 w-3.5" /> Saltar</button>
            </div>
          </>
        ) : (
          <div className="text-center py-2">
            <p className="font-display text-2xl text-noche">{ensayo ? "Ensayo terminado" : "¡Listo! 💛"}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {ensayo
                ? "Revisa en tu WhatsApp que llegaron todos y abre cada enlace: tiene que decir el nombre de esa persona."
                : "Revisa la lista: quien diga «Por enviar» se saltó o no se confirmó."}
            </p>
            <Button variant="outline" className="mt-3" onClick={cerrarSerie}>Cerrar</Button>
          </div>
        )}
      </div>
    ) : conVideo.length > 0 && (
      <div className="mb-4 rounded-xl border bg-background p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="text-sm">
            <p className="font-medium text-noche">{cola.length ? `${cola.length} por enviar` : "Nadie más con celular por enviar"}</p>
            {sinCelular.length > 0 && (
              <p className="text-xs text-aviso-800 mt-0.5">Sin celular en su ficha: {sinCelular.map((f) => f.nombre).join(", ")}</p>
            )}
          </div>
          {cola.length > 0 && (
            <Button variant="accent" className="h-11 w-full sm:w-auto" onClick={() => { setEnsayo(null); setSerie(cola); setPaso(0); setAbierto(false); }}>
              <Send className="h-4 w-4" /> Enviar a todos
            </Button>
          )}
        </div>
        {pidiendoNumero ? (
          <form onSubmit={(e) => { e.preventDefault(); empezarEnsayo(); }} className="flex gap-1.5">
            <input
              type="tel"
              inputMode="tel"
              autoFocus
              value={numeroEnsayo}
              onChange={(e) => setNumeroEnsayo(e.target.value)}
              placeholder="Tu celular, para mandarte el ensayo"
              className="min-w-0 flex-1 h-10 rounded-md border border-input bg-background px-3 text-base sm:text-sm"
            />
            <Button type="submit" variant="outline" className="h-10">Empezar</Button>
          </form>
        ) : (
          <button type="button" onClick={() => setPidiendoNumero(true)} className="text-xs text-atlantico underline underline-offset-2">
            Hacer un ensayo: mandarme los {conVideo.length} mensajes a mí primero
          </button>
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
