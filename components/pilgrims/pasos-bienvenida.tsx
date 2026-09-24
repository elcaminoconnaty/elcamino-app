"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, ClipboardList, FileText, Download, MessageCircle, Check, Copy, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { obtenerEnlacesPersonales, marcarPasoEnviado } from "@/lib/actions/registro";
import type { Aviso } from "@/lib/passport/verificar";

/**
 * Lo que sigue al contrato, en la tarjeta de cada inscripción:
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

  return (
    <div className="mt-3 rounded-md border p-3 space-y-3">
      {!datos.contratoEnviado && (
        <p className="text-xs text-muted-foreground">Lo normal es mandar esto después del contrato, pero no hace falta esperar.</p>
      )}

      {/* ── Paso 2: carta ── */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Carta de bienvenida
          </div>
          {datos.bienvenidaEnviada ? <Badge variant="success">Enviada · {fecha(datos.bienvenidaEnviada)}</Badge> : <Badge variant="muted">Por enviar</Badge>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/pdf/bienvenida/${datos.registrationId}`} target="_blank"><FileText className="h-4 w-4" /> Ver</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/pdf/bienvenida/${datos.registrationId}?descargar`}><Download className="h-4 w-4" /> Descargar</a>
          </Button>
          <Button size="sm" variant="accent" disabled={ocupado} onClick={() => whatsapp("bienvenida")} title="Abre el chat con el mensaje y el enlace a su carta">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => copiar("bienvenida")} title="Copia el mensaje con el enlace a su carta">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => marcar("bienvenida", !datos.bienvenidaEnviada)}>
            <Check className="h-4 w-4" /> {datos.bienvenidaEnviada ? "Desmarcar" : "Marcar enviada"}
          </Button>
        </div>
      </div>

      {/* ── Paso 3: formulario ── */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Formulario de registro
          </div>
          {datos.formularioLleno ? (
            <Badge variant="success">Lleno · {fecha(datos.formularioLleno)}</Badge>
          ) : datos.formularioEnviado ? (
            <Badge variant="warning">Enviado · {fecha(datos.formularioEnviado)}</Badge>
          ) : (
            <Badge variant="muted">Por enviar</Badge>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="accent" disabled={ocupado} onClick={() => whatsapp("formulario")} title="Abre el chat con el mensaje y su enlace personal">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => copiar("formulario")}>
            <Copy className="h-4 w-4" /> Copiar mensaje
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={ocupado}
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
            title="Abre el formulario tal como lo ve el peregrino"
          >
            Ver como peregrino
          </Button>
          {datos.formularioLleno && (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/pdf/registro/${datos.registrationId}`} target="_blank"><Download className="h-4 w-4" /> Ficha PDF</a>
            </Button>
          )}
        </div>

        {(problemas.length > 0 || verificado) && (
          <div className="mt-2 space-y-1">
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
      </div>
    </div>
  );
}
