import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { COLOR, CONTACTO } from "@/lib/brand";
import { MarcoPublico } from "@/components/publico/marco-publico";
import { cartaPorToken } from "@/lib/bienvenida/por-token";

/**
 * La carta de bienvenida del peregrino, dentro de una página con la marca. Un PDF abierto
 * directo en el navegador no lleva ícono ni título (la pestaña mostraba un pedazo del
 * enlace); acá la pestaña tiene el sello ECN y el mensaje de WhatsApp muestra su vista previa.
 *
 * En computador la carta se ve incrustada; en el celular (donde un PDF incrustado solo
 * muestra la primera página) va el botón para abrirla completa.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const c = await cartaPorToken(params.token);
  const titulo = c ? `Carta de bienvenida · ${c.camino}` : CONTACTO.marca;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return {
    title: titulo,
    description: "Todo lo que necesitas para prepararte en cuerpo y alma.",
    ...(base ? { metadataBase: new URL(base) } : {}),
    openGraph: {
      title: titulo,
      description: "Todo lo que necesitas para prepararte en cuerpo y alma.",
      siteName: CONTACTO.marca,
      type: "website",
      images: [{ url: "/icon-512.png", width: 512, height: 512, alt: CONTACTO.marca }],
    },
    robots: { index: false, follow: false },
  };
}

export default async function PaginaCarta({ params }: { params: { token: string } }) {
  const c = await cartaPorToken(params.token);
  if (!c) notFound();
  const boton: React.CSSProperties = { display: "inline-block", borderRadius: 4, padding: "12px 20px", fontSize: 15, letterSpacing: 0.5, textDecoration: "none" };
  return (
    <MarcoPublico titulo="CARTA DE BIENVENIDA" camino={c.camino}>
      <section className="text-center">
        <h1 className="font-display" style={{ fontSize: 36, color: COLOR.atlantico, margin: 0, lineHeight: 1.1 }}>{c.destinatario.bienvenida}</h1>
        <p className="font-display" style={{ fontSize: 19, fontStyle: "italic", color: COLOR.castano, marginTop: 10 }}>
          Lo importante no es solo llegar a Santiago… sino llegar a ti.
        </p>
        <p style={{ color: COLOR.castano, marginTop: 14, lineHeight: 1.6 }}>
          Te preparamos esta carta con todo lo que necesitas saber: la preparación interior y física, el itinerario, los alojamientos y el acompañamiento.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a href={c.pdf} target="_blank" rel="noreferrer" style={{ ...boton, background: COLOR.ocreProfundo, color: COLOR.alba }}>Abrir mi carta</a>
          {!c.formularioLleno && (
            <a href={c.formulario} style={{ ...boton, background: COLOR.atlantico, color: COLOR.alba }}>Llenar mis datos de registro</a>
          )}
        </div>
      </section>
      <iframe src={c.pdf} title="Carta de bienvenida" className="hidden md:block mt-8 w-full rounded" style={{ height: "80vh", border: `1px solid ${COLOR.piedra}`, background: "#fff" }} />
    </MarcoPublico>
  );
}
