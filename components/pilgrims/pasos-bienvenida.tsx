"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Download, MessageCircle, Copy, AlertTriangle, ShieldCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { obtenerEnlacesPersonales, marcarPasoEnviado } from "@/lib/actions/registro";
import type { Aviso } from "@/lib/passport/verificar";
import { Paso, type EstadoPaso } from "@/components/pilgrims/paso";

/**
 * Los pasos 2 y 3 del paso a paso de cada inscripción (el 1 es el contrato):
 *   2 · la carta de bienvenida (con su nombre), y
 *   3 · el formulario de registro, por su enlace personal.
 *
 * Los dos se mandan por WhatsApp con un mensaje ya escrito: el botón abre el chat de la
 * persona y deja el paso marcado como enviado. Nada sale solo: el mensaje lo envía Naty.
 */

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : null;

export type DatosPasos = {
  registrationId: string;
  pilgrimId: string;
  camino: string;
  nombre: string;
  sexo: string | null;
  telefono: string | null;
  contratoEnviado: boolean;
  bienvenidaEnviada: string | null;
  formularioEnviado: string | null;
  formularioLleno: string | null;
  avisos: Aviso[];
};

function mensajeCarta(d: DatosPasos, url: string) {
  const bienvenida = d.sexo === "F" ? "¡Bienvenida" : d.sexo === "M" ? "¡Bienvenido" : "¡Te damos la bienvenida";
  return `Hola ${d.nombre} 💛\n\n${bienvenida} a ${d.camino}! Te compartimos tu carta de bienvenida, con todo lo que necesitas para prepararte en cuerpo y alma:\n${url}\n\nNati & Nico`;
}

function mensajeFormulario(d: DatosPasos, url: string) {
  return `Hola ${d.nombre} 💛\n\nPara seguir con tu inscripción necesitamos tus datos para las reservas, el seguro y tu kit de peregrino (con la foto de tu pasaporte y tus tallas). Llénalos aquí:\n${url}\n\nEs tu enlace personal: solo tú ves tus datos. Si algo cambia, vuelve a entrar y corrígelo.`;
}

/**
 * El número como lo quiere wa.me: solo dígitos y con indicativo. Hay peregrinos guardados
 * como "300 491 2345", sin +57, y wa.me lo leería como indicativo 300: un celular colombiano
 * (10 dígitos que empiezan por 3) sin "+" se completa con 57. Si no hay número usable, null.
 */
export function numeroWhatsApp(telefono: string | null): string | null {
  const crudo = (telefono ?? "").trim();
  const digitos = crudo.replace(/\D/g, "");
  if (!crudo.startsWith("+") && /^3\d{9}$/.test(digitos)) return `57${digitos}`;
  if (crudo.startsWith("+") && digitos.length >= 8) return digitos;
  if (/^573\d{9}$/.test(digitos)) return digitos;
  return null;
}

/** Sin número usable, WhatsApp abre el selector de chats y el mensaje va igual. */
function enlaceWhatsApp(numero: string | null, texto: string) {
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(texto)}`;
}

/**
 * Copiar después de una acción de servidor: Safari rechaza `writeText` si ya no está "en el
 * clic". Con un `ClipboardItem` que recibe la promesa, el permiso se toma en el clic.
 */
async function copiarTexto(texto: Promise<string>) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": texto.then((t) => new Blob([t], { type: "text/plain" })) })]);
  } else {
    await navigator.clipboard.writeText(await texto);
  }
}

export function PasosBienvenida({ datos }: { datos: DatosPasos }) {
  const router = useRouter();
  const [ocupado, empezar] = useTransition();
  const [enlaces, setEnlaces] = useState<{ formulario: string; carta: string } | null>(null);

  async function conEnlaces() {
    if (enlaces) return enlaces;
    const r = await obtenerEnlacesPersonales(datos.registrationId);
    if (!r.ok) throw new Error(r.error);
    const e = { formulario: r.formulario, carta: r.carta };
    setEnlaces(e);
    return e;
  }

  function marcar(paso: "bienvenida" | "formulario", enviado: boolean) {
    empezar(async () => {
      const r = await marcarPasoEnviado(datos.registrationId, paso, enviado);
      if (!r.ok) toast({ title: "No se pudo marcar", description: r.error, variant: "destructive" });
      router.refresh();
    });
  }

  /** La ventana se abre en el mismo clic (si no, el navegador la bloquea) y después se le pone la dirección. */
  function whatsapp(paso: "bienvenida" | "formulario") {
    const ventana = window.open("about:blank", "_blank");
    const numero = numeroWhatsApp(datos.telefono);
    empezar(async () => {
      try {
        const e = await conEnlaces();
        const texto = paso === "bienvenida" ? mensajeCarta(datos, e.carta) : mensajeFormulario(datos, e.formulario);
        if (ventana) ventana.location.href = enlaceWhatsApp(numero, texto);
        if (numero) {
          await marcarPasoEnviado(datos.registrationId, paso, true);
          router.refresh();
        } else {
          // Sin número no sabemos a quién le llegó: que lo marque quien lo mandó.
          toast({ title: "No tiene un celular válido en su ficha", description: "Elige el chat en WhatsApp y, cuando lo mandes, toca «Marcar enviada».", variant: "destructive" });
        }
      } catch (err: any) {
        ventana?.close();
        toast({ title: "No se pudo preparar el mensaje", description: err?.message, variant: "destructive" });
      }
    });
  }

  function copiar(paso: "bienvenida" | "formulario") {
    const texto = conEnlaces().then((e) => (paso === "bienvenida" ? mensajeCarta(datos, e.carta) : mensajeFormulario(datos, e.formulario)));
    empezar(async () => {
      try {
        await copiarTexto(texto);
        toast({ title: "Mensaje copiado", description: "Con el enlace personal. Pégalo en el chat de WhatsApp.", variant: "success" });
      } catch (err: any) {
        toast({ title: "No se pudo copiar", description: err?.message, variant: "destructive" });
      }
    });
  }

  const problemas = datos.avisos.filter((a) => a.nivel !== "ok");
  const verificado = datos.avisos.find((a) => a.nivel === "ok");

  // El estado de cada paso: hecho, en curso (le toca ahora) o pendiente.
  const estadoCarta: EstadoPaso = datos.bienvenidaEnviada ? "hecho" : datos.contratoEnviado ? "en_curso" : "pendiente";
  const resumenCarta = datos.bienvenidaEnviada ? `Enviada · ${fecha(datos.bienvenidaEnviada)}` : datos.contratoEnviado ? "Toca mandarla" : "Por enviar";
  const estadoForm: EstadoPaso = datos.formularioLleno
    ? problemas.some((a) => a.nivel === "error") ? "en_curso" : "hecho"
    : datos.formularioEnviado || datos.bienvenidaEnviada ? "en_curso" : "pendiente";
  const resumenForm = datos.formularioLleno
    ? `Lleno · ${fecha(datos.formularioLleno)}${problemas.some((a) => a.nivel === "error") ? " · revisar pasaporte" : ""}`
    : datos.formularioEnviado
      ? `Enviado · ${fecha(datos.formularioEnviado)}, sin llenar`
      : datos.bienvenidaEnviada ? "Toca mandarlo" : "Por enviar";

  return (
    <>
      <Paso numero={2} titulo="Carta de bienvenida" estado={estadoCarta} resumen={resumenCarta}>
        <div className="flex gap-1.5 flex-wrap items-center">
          <Button size="sm" variant={estadoCarta === "en_curso" ? "accent" : "outline"} disabled={ocupado} onClick={() => whatsapp("bienvenida")} title="Abre su chat con el mensaje y el enlace a su carta">
            <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/peregrinos/${datos.pilgrimId}/carta/${datos.registrationId}`} title="Ver la carta con su nombre"><FileText className="h-4 w-4" /> Ver</a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={`/api/pdf/bienvenida/${datos.registrationId}?descargar`} title="Descargar el PDF"><Download className="h-4 w-4" /></a>
          </Button>
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => copiar("bienvenida")} title="Copiar el mensaje con el enlace a su carta">
            <Copy className="h-4 w-4" />
          </Button>
          <button type="button" disabled={ocupado} onClick={() => marcar("bienvenida", !datos.bienvenidaEnviada)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground ml-1">
            {datos.bienvenidaEnviada ? "desmarcar" : "ya la mandé"}
          </button>
        </div>
      </Paso>

      <Paso numero={3} titulo="Formulario de registro" estado={estadoForm} resumen={resumenForm} ultimo>
        <div className="flex gap-1.5 flex-wrap items-center">
          {datos.formularioLleno ? (
            <Button asChild size="sm" variant="accent">
              <a href={`/api/pdf/registro/${datos.registrationId}`} target="_blank"><FileText className="h-4 w-4" /> Ver sus datos</a>
            </Button>
          ) : (
            <Button size="sm" variant={estadoForm === "en_curso" && !datos.formularioEnviado ? "accent" : "outline"} disabled={ocupado} onClick={() => whatsapp("formulario")} title="Abre su chat con el mensaje y su enlace personal">
              <MessageCircle className="h-4 w-4" /> {datos.formularioEnviado ? "Recordarle por WhatsApp" : "Enviar por WhatsApp"}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => copiar("formulario")} title="Copiar el mensaje con su enlace personal">
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={ocupado}
            title="Abrir el formulario tal como lo ve el peregrino"
            onClick={() => {
              const ventana = window.open("about:blank", "_blank");
              empezar(async () => {
                try {
                  const e = await conEnlaces();
                  if (ventana) ventana.location.href = e.formulario;
                } catch (err: any) {
                  ventana?.close();
                  toast({ title: "No se pudo abrir", description: err?.message, variant: "destructive" });
                }
              });
            }}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          {!datos.formularioLleno && (
            <button type="button" disabled={ocupado} onClick={() => marcar("formulario", !datos.formularioEnviado)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground ml-1">
              {datos.formularioEnviado ? "desmarcar" : "ya lo mandé"}
            </button>
          )}
        </div>

        {(problemas.length > 0 || verificado) && (
          <div className="mt-2 space-y-1 rounded-md bg-muted/40 px-2.5 py-2">
            {verificado && problemas.length === 0 && (
              <p className="text-xs flex gap-2 items-start text-ok-700">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{verificado.texto}</span>
              </p>
            )}
            {problemas.map((a) => (
              <p key={a.texto} className={`text-xs flex gap-2 items-start ${a.nivel === "error" ? "text-error-700" : "text-aviso-800"}`}>
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{a.texto}</span>
              </p>
            ))}
          </div>
        )}
      </Paso>
    </>
  );
}
