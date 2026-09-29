import type { Metadata } from "next";
import { baseUrl } from "@/lib/url";
import { notFound } from "next/navigation";
import { COLOR, CONTACTO, OVERLAY_FOTO } from "@/lib/brand";
import { videoPorToken } from "@/lib/videos/por-token";
import { ReproductorVideo } from "@/components/publico/reproductor-video";

/**
 * El video personal de cada peregrino: un mensaje de su gente, entregado en el camino.
 *
 * Se abre desde WhatsApp y casi siempre en el celular, así que es una sola pantalla oscura
 * (el video luce sobre noche), con el nombre, el reproductor y nada más que distraiga. El
 * video no se ve hasta que la persona le da play: la sorpresa es parte del regalo, y por
 * eso la vista previa de WhatsApp muestra el sello y no un fotograma.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const v = await videoPorToken(params.token);
  const titulo = v ? `Un mensaje para ti, ${v.nombre}` : CONTACTO.marca;
  const descripcion = "Hay personas que caminan contigo aunque no estén aquí.";
  const base = baseUrl();
  return {
    title: titulo,
    description: descripcion,
    ...(base ? { metadataBase: new URL(base) } : {}),
    openGraph: {
      title: titulo,
      description: descripcion,
      siteName: CONTACTO.marca,
      type: "website",
      images: [{ url: "/icon-512.png", width: 512, height: 512, alt: CONTACTO.marca }],
    },
    robots: { index: false, follow: false },
  };
}

export default async function PaginaVideo({ params, searchParams }: { params: { token: string }; searchParams: { vista?: string } }) {
  const v = await videoPorToken(params.token);
  if (!v) notFound();
  return (
    <main style={{ background: COLOR.noche, color: COLOR.alba, minHeight: "100svh", position: "relative", overflow: "hidden" }}>
      {/* La portada de la carta, muy velada: la misma casa, pero de noche para que el video mande. */}
      <img src="/bienvenida/portada.jpg" alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35 }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${OVERLAY_FOTO} 0%, ${COLOR.noche} 70%)` }} />

      <div className="relative mx-auto flex flex-col items-center px-4 text-center" style={{ maxWidth: 560, paddingTop: "max(28px, env(safe-area-inset-top))", paddingBottom: 28 }}>
        <img src="/bienvenida/logo-blanco.png" alt={CONTACTO.marca} style={{ width: 88 }} />
        <div className="font-seal" style={{ fontSize: 11, letterSpacing: 3, color: COLOR.ocreClaro, marginTop: 16 }}>
          {v.camino.toUpperCase()}
        </div>
        <h1 className="font-display" style={{ fontSize: "clamp(34px, 9vw, 48px)", fontWeight: 500, lineHeight: 1.05, margin: "10px 0 0" }}>
          Para ti, {v.nombre}
        </h1>
        <p className="font-display" style={{ fontSize: 20, fontStyle: "italic", color: COLOR.piedra, margin: "10px 0 0", lineHeight: 1.35, maxWidth: 420 }}>
          Hay personas que caminan contigo aunque no estén aquí. Te dejaron un mensaje.
        </p>
        <div aria-hidden style={{ width: 48, height: 2, background: COLOR.ocre, margin: "20px auto 22px" }} />

        <ReproductorVideo token={params.token} src={v.src} ancho={v.ancho} alto={v.alto} minutos={v.minutos} nombre={v.nombre} contar={searchParams.vista !== "equipo"} />

        <p style={{ fontSize: 13, color: COLOR.niebla, marginTop: 22, lineHeight: 1.5, maxWidth: 380 }}>
          Este enlace es solo tuyo: nadie más del grupo puede ver este video.
        </p>

        <footer style={{ marginTop: 34 }}>
          <div className="font-display" style={{ fontSize: 18, fontStyle: "italic", color: COLOR.ocreClaro }}>{CONTACTO.mantra}</div>
          <div style={{ fontSize: 13, color: COLOR.niebla, marginTop: 6 }}>Con amor, Nati &amp; Nico</div>
        </footer>
      </div>
    </main>
  );
}
