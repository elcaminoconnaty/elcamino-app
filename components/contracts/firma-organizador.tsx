"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { SignaturePad } from "./signature-pad";
import { guardarFirmaOrganizador } from "@/lib/actions/contracts";

/**
 * Donde Naty captura su firma, una sola vez.
 *
 * Se guarda como imagen y se estampa en todos los contratos que emita. Mientras no exista,
 * los contratos salen con su nombre en cursiva — válido bajo la Ley 527, que exige un método
 * confiable y no un garabato, pero se ve a medio hacer.
 *
 * Se firma mejor desde el celular con el dedo que con el mouse.
 */
export function FirmaOrganizador({ yaCapturada }: { yaCapturada: boolean }) {
  const [trazo, setTrazo] = useState<string | null>(null);
  const [rehacer, setRehacer] = useState(!yaCapturada);
  const [pendiente, empezar] = useTransition();

  if (!rehacer) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Tu firma ya está guardada y se estampa en cada contrato que emitís.
        </p>
        <Button variant="outline" size="sm" onClick={() => setRehacer(true)}>
          Cambiar mi firma
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Dibujá tu firma como la harías en papel. Se guarda una sola vez y va en todos los
        contratos. Desde el celular sale mucho mejor que con el mouse.
      </p>
      <SignaturePad onChange={setTrazo} disabled={pendiente} />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="accent"
          disabled={pendiente || !trazo}
          onClick={() =>
            empezar(async () => {
              try {
                await guardarFirmaOrganizador(trazo!);
                toast({ title: "Firma guardada", variant: "success" });
                setRehacer(false);
              } catch (e: any) {
                toast({ title: "No se pudo", description: e?.message, variant: "destructive" });
              }
            })
          }
        >
          Guardar mi firma
        </Button>
        {yaCapturada && (
          <Button size="sm" variant="ghost" onClick={() => setRehacer(false)} disabled={pendiente}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
