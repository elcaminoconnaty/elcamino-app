import { notFound } from "next/navigation";
import { COLOR, CONTACTO } from "@/lib/brand";
import { menuPorToken } from "@/lib/menus/por-token";
import { FormularioMenu } from "./form-menu";

/**
 * La página desde la que cada peregrino elige sus cenas.
 *
 * Es pública: se protege por el token de 256 bits del enlace, no por sesión. Está exenta
 * del middleware y `next.config.mjs` le pone `Referrer-Policy: no-referrer` y `noindex`.
 */
export const dynamic = "force-dynamic";

export default async function PaginaMenu({ params }: { params: { token: string } }) {
  const datos = await menuPorToken(params.token);
  if (!datos) notFound();

  return (
    <main style={{ background: COLOR.alba, minHeight: "100vh" }}>
      <header style={{ background: COLOR.atlantico, padding: "22px 24px" }}>
        <div className="mx-auto" style={{ maxWidth: 760 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 20, letterSpacing: 1.5, color: COLOR.alba }}>
            {CONTACTO.marca}
          </div>
          <div style={{ fontSize: 10, letterSpacing: 2.5, color: COLOR.ocreClaro, marginTop: 10 }}>
            ELIGE TU MENÚ
          </div>
        </div>
      </header>

      <div className="mx-auto px-6 py-8" style={{ maxWidth: 760 }}>
        {datos.estado === "activo" ? (
          <FormularioMenu token={params.token} datos={datos} />
        ) : (
          <section className="rounded p-6" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, color: COLOR.atlantico, margin: 0 }}>
              Este enlace ya no está activo
            </h1>
            <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>
              Tu inscripción a {datos.camino} no está vigente. Si crees que es un error, escríbenos por WhatsApp y lo
              revisamos.
            </p>
          </section>
        )}
      </div>

      <footer
        className="px-6 py-5 text-center"
        style={{ background: COLOR.atlantico, color: "rgba(245,238,227,0.85)", fontSize: 12 }}
      >
        {CONTACTO.whatsapp} · {CONTACTO.correo}
      </footer>
    </main>
  );
}
