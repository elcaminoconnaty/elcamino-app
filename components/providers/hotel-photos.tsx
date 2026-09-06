"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { borrarFoto, moverFoto, registrarFoto, urlDeSubidaDeFoto } from "@/lib/actions/provider-photos";

export type FotoProveedor = { id: string; storage_path: string; url: string; caption: string | null };

/**
 * Las fotos del alojamiento, en la ficha del proveedor.
 *
 * El documento de viaje toma **las tres primeras**, así que el orden es una decisión
 * editorial y no un detalle: fachada, habitación, baño. Por eso se pueden mover.
 *
 * Se comprimen en el navegador antes de subir: una foto de celular pesa entre 3 y 8 MB y
 * en Camino Sacro la primera carga real se cayó por eso.
 */
export function HotelPhotos({ providerId, fotos }: { providerId: string; fotos: FotoProveedor[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [pendiente, empezar] = useTransition();

  /** Reduce el lado mayor a 1600 px y recomprime. Suficiente para imprimir a 3 columnas. */
  async function comprimir(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No pude procesar la imagen."))), "image/jpeg", 0.82)
    );
  }

  async function subir(files: FileList) {
    setSubiendo(true);
    try {
      for (const file of Array.from(files)) {
        const blob = await comprimir(file);
        const { ruta, signedUrl } = await urlDeSubidaDeFoto(providerId, "image/jpeg");
        const r = await fetch(signedUrl, {
          method: "PUT",
          body: blob,
          headers: { "content-type": "image/jpeg" },
        });
        if (!r.ok) throw new Error(`No pude subir ${file.name}.`);
        await registrarFoto(providerId, ruta);
      }
      toast({ title: files.length > 1 ? "Fotos cargadas" : "Foto cargada", variant: "success" });
    } catch (e: any) {
      toast({ title: "No se pudo", description: e?.message, variant: "destructive" });
    }
    setSubiendo(false);
    if (input.current) input.current.value = "";
  }

  const correr = (fn: () => Promise<unknown>) =>
    empezar(async () => {
      try {
        await fn();
      } catch (e: any) {
        toast({ title: "No se pudo", description: e?.message, variant: "destructive" });
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          El documento de viaje usa las tres primeras, en este orden.
          {fotos.length > 3 && ` Las otras ${fotos.length - 3} quedan guardadas.`}
        </p>
        <Button size="sm" variant="outline" disabled={subiendo} onClick={() => input.current?.click()}>
          <ImagePlus className="h-4 w-4" /> {subiendo ? "Subiendo…" : "Añadir fotos"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && subir(e.target.files)}
        />
      </div>

      {fotos.length === 0 ? (
        <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          Sin fotos. El documento de viaje va a mostrar un hueco en su lugar.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {fotos.map((f, i) => (
            <figure key={f.id} className="relative overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element -- el cubo es público y next/image pediría configuración de dominios */}
              <img src={f.url} alt={f.caption ?? ""} className="aspect-[3/2] w-full object-cover" />
              {i < 3 && (
                <span className="absolute left-1 top-1 rounded bg-ocre-profundo px-1.5 py-0.5 text-[10px] font-medium text-alba">
                  {i + 1}
                </span>
              )}
              <figcaption className="flex justify-between gap-1 p-1">
                <span className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Mover antes"
                    disabled={pendiente || i === 0}
                    onClick={() => correr(() => moverFoto(f.id, providerId, -1))}
                    className="rounded p-1 hover:bg-muted disabled:opacity-30"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Mover después"
                    disabled={pendiente || i === fotos.length - 1}
                    onClick={() => correr(() => moverFoto(f.id, providerId, 1))}
                    className="rounded p-1 hover:bg-muted disabled:opacity-30"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </span>
                <button
                  type="button"
                  aria-label="Borrar foto"
                  disabled={pendiente}
                  onClick={() => correr(() => borrarFoto(f.id, providerId))}
                  className="rounded p-1 text-error-700 hover:bg-error-50 disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
