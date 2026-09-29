"use server";
import { intentar } from "@/lib/resultado";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Las fotos de un alojamiento.
 *
 * Viven con el proveedor, no con la reserva: Naty carga el Hotel Roma una vez y sirve para
 * septiembre, para abril y para el que venga. Eso es lo que pedía la "sola verdad".
 *
 * Van al cubo `brand`, que es público — son fotos de hoteles y el documento de viaje se abre
 * por enlace sin sesión. Nada sensible pasa por acá.
 */

const TIPOS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/**
 * URL firmada para subir desde el navegador. Se sube directo al cubo y no a través de una
 * server action, que tiene límite de tamaño y no está para mover megas de fotos.
 */
export async function urlDeSubidaDeFoto(providerId: string, contentType: string) {
  return intentar(async () => {
    const ext = TIPOS[contentType];
    if (!ext) throw new Error("Solo admitimos JPG, PNG o WebP.");

    const supabase = createClient();
    const ruta = `hoteles/${providerId}/${Date.now()}${ext}`;
    const { data, error } = await supabase.storage.from("brand").createSignedUploadUrl(ruta);
    if (error) throw new Error(error.message);
    return { ruta, signedUrl: data.signedUrl, token: data.token };
  });
}

/** Registra la foto ya subida. Va al final de la fila. */
export async function registrarFoto(providerId: string, storagePath: string, caption?: string) {
  return intentar(async () => {
    const supabase = createClient();
    const { data: previas } = await supabase
      .from("provider_photos")
      .select("position")
      .eq("provider_id", providerId)
      .order("position", { ascending: false })
      .limit(1);

    const { error } = await supabase.from("provider_photos").insert({
      provider_id: providerId,
      storage_path: storagePath,
      caption: caption ?? null,
      position: (previas?.[0]?.position ?? -1) + 1,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/proveedores/${providerId}`);
  });
}

/** Borra la foto y el archivo. Un archivo huérfano en el cubo no le sirve a nadie. */
export async function borrarFoto(photoId: string, providerId: string) {
  return intentar(async () => {
    const supabase = createClient();
    const { data: foto, error: errLeer } = await supabase
      .from("provider_photos")
      .select("storage_path")
      .eq("id", photoId)
      .single();
    if (errLeer) throw new Error(errLeer.message);

    const { error } = await supabase.from("provider_photos").delete().eq("id", photoId);
    if (error) throw new Error(error.message);
    if (foto?.storage_path) await supabase.storage.from("brand").remove([foto.storage_path]);
    revalidatePath(`/proveedores/${providerId}`);
  });
}

/**
 * Reordena. El documento toma las tres primeras, así que el orden es una decisión
 * editorial: primero la fachada, luego la habitación, luego el baño.
 */
export async function moverFoto(photoId: string, providerId: string, direccion: -1 | 1) {
  return intentar(async () => {
    const supabase = createClient();
    const { data: fotos } = await supabase
      .from("provider_photos")
      .select("id, position")
      .eq("provider_id", providerId)
      .order("position");
    if (!fotos) return;

    const i = fotos.findIndex((f) => f.id === photoId);
    const j = i + direccion;
    if (i < 0 || j < 0 || j >= fotos.length) return;

    const resultados = await Promise.all([
      supabase.from("provider_photos").update({ position: fotos[j].position }).eq("id", fotos[i].id),
      supabase.from("provider_photos").update({ position: fotos[i].position }).eq("id", fotos[j].id),
    ]);
    const fallo = resultados.find((r) => r.error)?.error;
    if (fallo) throw new Error(fallo.message);
    revalidatePath(`/proveedores/${providerId}`);
  });
}
