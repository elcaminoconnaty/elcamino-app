"use client";

import { useState, useTransition } from "react";
import { FileSignature, Send, ShieldCheck, FileText, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import {
  anularContrato, enviarContratoAFirmar, generarContrato, verificarIntegridad,
} from "@/lib/actions/contracts";

/**
 * El módulo de contrato, dentro de la tarjeta de cada inscripción del peregrino.
 *
 * Va acá y no en la ficha del peregrino porque un contrato es por inscripción: el mismo
 * peregrino puede hacer dos caminos con precios y acuerdos de pago distintos.
 *
 * Cuando faltan datos no genera nada y dice **qué** falta y **dónde** arreglarlo. Nunca
 * rellena a ojo: en Camino Sacro el generador se inventaba la duración del viaje cuando a
 * la ruta le faltaban etapas, y salió una oferta prometiendo quince días sobre trece.
 */

export type EstadoContrato = {
  id: string;
  status: "borrador" | "enviado" | "visto" | "firmado" | "anulado";
  version: number;
  codigo: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  huella: string | null;
  urlVerificacion: string | null;
};

export type Pendiente = { campo: string; que_falta: string; donde: string };

const ETIQUETA: Record<EstadoContrato["status"], { texto: string; variante: any }> = {
  borrador: { texto: "Borrador", variante: "muted" },
  enviado: { texto: "Enviado", variante: "warning" },
  visto: { texto: "Lo abrió", variante: "warning" },
  firmado: { texto: "Firmado", variante: "success" },
  anulado: { texto: "Anulado", variante: "muted" },
};

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function ContractCard({
  registrationId,
  pilgrimId,
  contrato,
  pendientes,
  avisos,
}: {
  registrationId: string;
  pilgrimId: string;
  contrato: EstadoContrato | null;
  pendientes: Pendiente[];
  avisos: string[];
}) {
  const [pendiente, empezar] = useTransition();
  const [integridad, setIntegridad] = useState<string | null>(null);

  const correr = (fn: () => Promise<unknown>, exito: string) =>
    empezar(async () => {
      try {
        await fn();
        toast({ title: exito });
      } catch (e: any) {
        toast({ title: "No se pudo", description: e?.message ?? String(e), variant: "destructive" });
      }
    });

  const bloqueado = pendientes.length > 0;

  return (
    <div className="mt-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileSignature className="h-4 w-4 text-muted-foreground" />
          Contrato
        </div>
        {contrato && (
          <Badge variant={ETIQUETA[contrato.status].variante}>
            {ETIQUETA[contrato.status].texto}
            {contrato.version > 1 ? ` · v${contrato.version}` : ""}
          </Badge>
        )}
      </div>

      {avisos.map((a, i) => (
        <p key={i} className="text-xs flex gap-2 items-start mb-2 text-aviso-800">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{a}</span>
        </p>
      ))}

      {!contrato && bloqueado && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Para poder generar el contrato falta:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {pendientes.map((p) => (
              <li key={p.campo + p.que_falta}>
                {p.que_falta} <span className="opacity-70">— en {p.donde}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!contrato && !bloqueado && (
        <Button
          size="sm"
          variant="accent"
          disabled={pendiente}
          onClick={() => correr(() => generarContrato(registrationId, pilgrimId), "Contrato generado")}
        >
          <FileSignature className="h-4 w-4" /> Generar contrato
        </Button>
      )}

      {contrato && (
        <>
          <ol className="text-xs text-muted-foreground space-y-0.5 mb-3">
            <li>Enviado · {fecha(contrato.sentAt)}</li>
            <li>Lo abrió · {fecha(contrato.viewedAt)}</li>
            <li>Firmado · {fecha(contrato.signedAt)}</li>
          </ol>

          <div className="flex gap-2 flex-wrap">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/pdf/contrato/${contrato.id}`} target="_blank">
                <FileText className="h-4 w-4" /> Ver PDF
              </a>
            </Button>

            {contrato.status !== "firmado" && contrato.status !== "anulado" && (
              <Button
                size="sm"
                variant="accent"
                disabled={pendiente}
                onClick={() =>
                  correr(
                    () => enviarContratoAFirmar(contrato.id, pilgrimId),
                    contrato.status === "borrador" ? "Contrato enviado a firmar" : "Se lo reenviamos"
                  )
                }
              >
                <Send className="h-4 w-4" /> {contrato.status === "borrador" ? "Enviar a firmar" : "Reenviar"}
              </Button>
            )}

            {contrato.status === "firmado" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pendiente}
                onClick={() =>
                  empezar(async () => {
                    const r = await verificarIntegridad(contrato.id);
                    setIntegridad(
                      r.ok
                        ? "El archivo guardado es exactamente el que se firmó."
                        : `Atención: ${"motivo" in r ? r.motivo : "no coincide"}`
                    );
                  })
                }
              >
                <ShieldCheck className="h-4 w-4" /> Verificar integridad
              </Button>
            )}

            {contrato.status !== "anulado" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pendiente || bloqueado}
                onClick={() =>
                  correr(
                    () =>
                      contrato.status === "firmado"
                        ? generarContrato(registrationId, pilgrimId)
                        : anularContrato(contrato.id, pilgrimId, "corregido desde la plataforma"),
                    contrato.status === "firmado" ? "Versión nueva generada" : "Contrato anulado"
                  )
                }
                title={
                  contrato.status === "firmado"
                    ? "Emite una versión nueva. El peregrino la tendrá que volver a firmar."
                    : "Anula este contrato sin emitir otro."
                }
              >
                <RotateCcw className="h-4 w-4" /> {contrato.status === "firmado" ? "Corregir" : "Anular"}
              </Button>
            )}
          </div>

          {integridad && <p className="text-xs mt-2 text-muted-foreground">{integridad}</p>}

          {contrato.urlVerificacion && (
            <p className="text-[11px] mt-2 text-muted-foreground break-all">
              Verificación pública:{" "}
              <a href={contrato.urlVerificacion} target="_blank" className="underline">
                {contrato.urlVerificacion}
              </a>
            </p>
          )}
        </>
      )}
    </div>
  );
}
