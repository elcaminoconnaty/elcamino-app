"use client";

import { useState, useTransition } from "react";
import { Copy, ExternalLink, FileText, Link2, Send, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
  despublicarDocumentoDeViaje, enviarDocumentoAlGrupo, publicarDocumentoDeViaje,
} from "@/lib/actions/travel-doc";

/**
 * Publicar, copiar el enlace y mandarlo al grupo.
 *
 * El enlace no caduca a propósito: el peregrino lo va a abrir durante meses. Se retira desde
 * acá cuando hace falta.
 */
export function AccionesDocumento({ departureId, token }: { departureId: string; token: string | null; inscritos?: number }) {
  const [url, setUrl] = useState<string | null>(
    token ? `${typeof window !== "undefined" ? window.location.origin : ""}/viaje/${token}` : null
  );
  const [pendiente, empezar] = useTransition();

  const correr = (fn: () => Promise<unknown>, exito: string) =>
    empezar(async () => {
      try {
        await fn();
        toast({ title: exito, variant: "success" });
      } catch (e: any) {
        toast({ title: "No se pudo", description: e?.message, variant: "destructive" });
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!url ? (
          <Button
            size="sm"
            variant="accent"
            disabled={pendiente}
            onClick={() =>
              empezar(async () => {
                try {
                  const r = await publicarDocumentoDeViaje(departureId);
                  setUrl(r.url);
                  toast({ title: "Documento publicado", variant: "success" });
                } catch (e: any) {
                  toast({ title: "No se pudo", description: e?.message, variant: "destructive" });
                }
              })
            }
          >
            <Link2 className="h-4 w-4" /> Publicar y obtener enlace
          </Button>
        ) : (
          <>
            <Button asChild size="sm" variant="outline">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> Ver como el peregrino
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(url);
                toast({ title: "Enlace copiado" });
              }}
            >
              <Copy className="h-4 w-4" /> Copiar enlace
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/pdf/viaje/${token}`} target="_blank" rel="noreferrer">
                <FileText className="h-4 w-4" /> PDF
              </a>
            </Button>
            <Button
              size="sm"
              variant="accent"
              disabled={pendiente}
              onClick={() =>
                empezar(async () => {
                  try {
                    const r = await enviarDocumentoAlGrupo(departureId);
                    toast({
                      title: `Enviado a ${r.enviados} de ${r.total}`,
                      description: r.fallidos.length
                        ? `No salió para: ${r.fallidos.map((f) => f.email).join(", ")}`
                        : undefined,
                      variant: r.fallidos.length ? "destructive" : "success",
                    });
                  } catch (e: any) {
                    toast({ title: "No se pudo", description: e?.message, variant: "destructive" });
                  }
                })
              }
            >
              <Send className="h-4 w-4" /> Mandar al grupo
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pendiente}
              title="Retira el enlace: quien lo tenga deja de poder abrirlo."
              onClick={() =>
                correr(async () => {
                  await despublicarDocumentoDeViaje(departureId);
                  setUrl(null);
                }, "Enlace retirado")
              }
            >
              <Unlink className="h-4 w-4" /> Retirar
            </Button>
          </>
        )}
      </div>

      {url && (
        <p className="text-xs text-muted-foreground break-all">
          {url} — el enlace no caduca y muestra siempre la última versión, así que si corregís
          algo no hace falta reenviar nada.
        </p>
      )}
    </div>
  );
}
