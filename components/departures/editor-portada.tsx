"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { guardarPortada } from "@/lib/actions/travel-doc";

/**
 * La portada del documento: lo único que no sale de la operación.
 *
 * La foto va por URL en vez de por subida porque suele ser una que ya está en la web o en
 * el cubo de la marca. Si hace falta subir una nueva, se hace desde la ficha de un
 * proveedor y se pega el enlace acá.
 */
export function EditorPortada({
  departureId,
  valores,
}: {
  departureId: string;
  valores: Record<string, string>;
}) {
  const [foto, setFoto] = useState(valores.cover_photo ?? "");
  const [tagline, setTagline] = useState(valores.tagline ?? "");
  const [banda, setBanda] = useState(valores.banda ?? "");
  const [pendiente, empezar] = useTransition();

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <Label>Foto de portada</Label>
        <Input value={foto} onChange={(e) => setFoto(e.target.value)} placeholder="https://…" />
      </div>
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element -- puede venir de cualquier origen
        <img src={foto} alt="" className="aspect-[4/5] w-full max-h-48 object-cover rounded" />
      )}
      <div className="grid gap-2">
        <Label>Frase de portada</Label>
        <Input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="El verdadero territorio que caminas eres tú"
        />
      </div>
      <div className="grid gap-2">
        <Label>Banda inferior</Label>
        <Input value={banda} onChange={(e) => setBanda(e.target.value)} placeholder="Itinerario y reservas" />
      </div>
      <Button
        size="sm"
        variant="accent"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            try {
              await guardarPortada(departureId, {
                cover_photo: foto || undefined,
                tagline: tagline || undefined,
                banda: banda || undefined,
              });
              toast({ title: "Portada guardada", variant: "success" });
            } catch (e: any) {
              toast({ title: "No se pudo", description: e?.message, variant: "destructive" });
            }
          })
        }
      >
        {pendiente ? "Guardando…" : "Guardar portada"}
      </Button>
    </div>
  );
}
