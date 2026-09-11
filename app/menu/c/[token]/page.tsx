import Link from "next/link";
import { notFound } from "next/navigation";
import { COLOR, CONTACTO } from "@/lib/brand";
import { listaPorTokenDeCamino, menuPorAcceso } from "@/lib/menus/por-token";
import { FormularioMenu } from "@/app/menu/[token]/form-menu";
import { ElegirNombre } from "./elegir-nombre";

/**
 * El enlace único del camino para elegir las cenas: primero la lista de nombres, y al
 * elegir uno (`?yo=<inscripción>`) el mismo formulario del enlace personal.
 *
 * Es pública: se protege por el token de 256 bits del camino, no por sesión. Comparte
 * el prefijo /menu, así que el middleware y `next.config.mjs` ya la tratan como pública
 * (no-referrer, noindex).
 */
export const dynamic = "force-dynamic";

function Marco({ subtitulo, children }: { subtitulo: string; children: React.ReactNode }) {
  return (
    <main style={{ background: COLOR.alba, minHeight: "100vh" }}>
      <header style={{ background: COLOR.atlantico, padding: "22px 24px" }}>
        <div className="mx-auto" style={{ maxWidth: 760 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 20, letterSpacing: 1.5, color: COLOR.alba }}>
            {CONTACTO.marca}
          </div>
          <div style={{ fontSize: 10, letterSpacing: 2.5, color: COLOR.ocreClaro, marginTop: 10 }}>{subtitulo}</div>
        </div>
      </header>
      <div className="mx-auto px-6 py-8" style={{ maxWidth: 760 }}>{children}</div>
      <footer className="px-6 py-5 text-center" style={{ background: COLOR.atlantico, color: "rgba(245,238,227,0.85)", fontSize: 12 }}>
        {CONTACTO.whatsapp} · {CONTACTO.correo}
      </footer>
    </main>
  );
}

export default async function PaginaMenuCamino({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { yo?: string };
}) {
  const yo = searchParams.yo?.trim() || null;

  if (yo) {
    const datos = await menuPorAcceso({ token: params.token, registrationId: yo });
    if (!datos) notFound();
    return (
      <Marco subtitulo="ELIGE TU MENÚ">
        <p style={{ fontSize: 13, color: COLOR.castano, margin: "0 0 14px" }}>
          Estás eligiendo como <strong style={{ color: COLOR.atlantico }}>{datos.nombre}</strong>.{" "}
          <Link href={`/menu/c/${params.token}`} style={{ color: COLOR.ocreProfundo, textDecoration: "underline" }}>
            No soy yo
          </Link>
        </p>
        {datos.estado === "activo" ? (
          <FormularioMenu ctx={{ token: params.token, registrationId: yo }} datos={datos} />
        ) : (
          <section className="rounded p-6" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, color: COLOR.atlantico, margin: 0 }}>Esta inscripción ya no está activa</h1>
            <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>
              Si crees que es un error, escríbenos por WhatsApp y lo revisamos.
            </p>
          </section>
        )}
      </Marco>
    );
  }

  const lista = await listaPorTokenDeCamino(params.token);
  if (!lista) notFound();
  return (
    <Marco subtitulo="ELIGE TU MENÚ">
      <ElegirNombre token={params.token} lista={lista} />
    </Marco>
  );
}
