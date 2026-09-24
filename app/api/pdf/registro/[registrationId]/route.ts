import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { registroDeInscripcion } from "@/lib/registro/datos-equipo";
import { FichaRegistroPDF } from "@/components/pdf/ficha-registro";

/** La ficha de registro de un peregrino, con la foto de su pasaporte. Solo para el equipo. */
export const dynamic = "force-dynamic";

/** react-pdf solo pinta JPG y PNG: un PDF o un WEBP se queda en la ficha de la plataforma. */
async function fotoDelPasaporte(path: string | null) {
  if (!path) return { src: null, nota: "No ha subido el pasaporte." } as const;
  const { data, error } = await createClient().storage.from("passports").download(path);
  if (error || !data) return { src: null, nota: "No se pudo leer el archivo del pasaporte." } as const;
  const buf = Buffer.from(await data.arrayBuffer());
  const esJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const esPng = buf[0] === 0x89 && buf[1] === 0x50;
  if (esJpg || esPng) return { src: buf, nota: null } as const;
  return { src: null, nota: "El pasaporte está en PDF u otro formato: se ve desde la tarjeta del peregrino, en «Pasaporte / Datos»." } as const;
}

export async function GET(_req: Request, { params }: { params: { registrationId: string } }) {
  const r = await registroDeInscripcion(params.registrationId);
  if (!r) return new NextResponse("No encontré esa inscripción.", { status: 404 });
  const foto = await fotoDelPasaporte(r.fila.pasaportePath);
  const pdf = await renderToBuffer(FichaRegistroPDF({ camino: r.camino, fila: r.fila, foto }) as any);
  const nombre = `Registro-${r.fila.nombre}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-");
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nombre}.pdf"`, "Cache-Control": "no-store" },
  });
}
