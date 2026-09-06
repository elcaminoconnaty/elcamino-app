"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { guardarPortada, urlDeSubidaDePortada } from "@/lib/actions/travel-doc";
import { ImagePlus } from "lucide-react";

/**
 * La portada del documento: lo único que no sale de la operación.
 *
 * La foto se puede subir o pegar por enlace: a veces es una del propio grupo que Naty tiene
 * en el celular, y a veces una que ya está en la web. Se comprime en el navegador antes de
 * subir, porque una foto de celular pesa entre 3 y 8 MB.
 *
 * El brandbook pide vertical 4:5 para portada, y el texto va sobre un velo de noche al 55 %,
 * así que conviene una foto con aire arriba.
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
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);

  /** Reduce el lado mayor a 2000 px: la portada se imprime a página completa. */
  async function subir(file: File) {
    setSubiendo(true);
    try {
      const bitmap = await createImageBitmap(file);
      const escala = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * escala);
      canvas.height = Math.round(bitmap.height * escala);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("No pude procesar la imagen."))), "image/jpeg", 0.85)
      );

      const { signedUrl, urlPublica } = await urlDeSubidaDePortada(departureId, "image/jpeg");
      const r = await fetch(signedUrl, { method: "PUT", body: blob, headers: { "content-type": "image/jpeg" } });
      if (!r.ok) throw new Error("No pude subir la foto.");

      setFoto(urlPublica);
      await guardarPortada(departureId, { cover_photo: urlPublica });
      toast({ title: "Portada actualizada", variant: "success" });
    } catch (e: any) {
      toast({ title: "No se pudo", description: e?.message, variant: "destructive" });
    }
    setSubiendo(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <Label>Foto de portada</Label>
        <Button size="sm" variant="outline" disabled={subiendo} onClick={() => input.current?.click()}>
          <ImagePlus className="h-4 w-4" /> {subiendo ? "Subiendo…" : "Subir una foto"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])}
        />
        <Input value={foto} onChange={(e) => setFoto(e.target.value)} placeholder="…o pegá un enlace" />
        <p className="text-xs text-muted-foreground">
          Vertical, con aire arriba: el título va encima, sobre un velo oscuro.
        </p>
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
