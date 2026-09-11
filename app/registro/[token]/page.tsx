import Link from "next/link";
import { notFound } from "next/navigation";
import { COLOR, CONTACTO } from "@/lib/brand";
import { listaPorToken, fichaPorToken } from "@/lib/registro/por-token";
import { ElegirNombreRegistro } from "./elegir-nombre";
import { FormularioRegistro } from "./form-registro";

/**
 * El formulario de inscripción: un solo enlace por camino. Primero la lista de nombres,
 * y al elegir el suyo (`?yo=<inscripción>`) el formulario con sus datos.
 *
 * Es pública: se protege por el token de 256 bits del camino, no por sesión. Está en la
 * lista de rutas públicas del middleware y `next.config.mjs` le pone no-referrer y noindex.
 */
export const dynamic = "force-dynamic";

function Marco({ subtitulo, children }: { subtitulo: string; children: React.ReactNode }) {
  return (
    <main style={{ background: COLOR.alba, minHeight: "100vh" }}>
      <header style={{ background: COLOR.atlantico, padding: "22px 24px" }}>
        <div className="mx-auto" style={{ maxWidth: 760 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 20, letterSpacing: 1.5, color: COLOR.alba }}>{CONTACTO.marca}</div>
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

export default async function PaginaRegistro({ params, searchParams }: { params: { token: string }; searchParams: { yo?: string } }) {
  const yo = searchParams.yo?.trim() || null;

  if (yo) {
    const ficha = await fichaPorToken(params.token, yo);
    if (!ficha) notFound();
    return (
      <Marco subtitulo="REGISTRO DE PEREGRINOS">
        <p style={{ fontSize: 13, color: COLOR.castano, margin: "0 0 14px" }}>
          Estás llenando los datos de <strong style={{ color: COLOR.atlantico }}>{ficha.nombre}</strong>.{" "}
          <Link href={`/registro/${params.token}`} style={{ color: COLOR.ocreProfundo, textDecoration: "underline" }}>
            No soy yo
          </Link>
        </p>
        {ficha.estado === "activo" ? (
          <FormularioRegistro token={params.token} registrationId={yo} ficha={ficha} />
        ) : (
          <section className="rounded p-6" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, color: COLOR.atlantico, margin: 0 }}>Esta inscripción ya no está activa</h1>
            <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>Si crees que es un error, escríbenos por WhatsApp y lo revisamos.</p>
          </section>
        )}
      </Marco>
    );
  }

  const lista = await listaPorToken(params.token);
  if (!lista) notFound();
  return (
    <Marco subtitulo="REGISTRO DE PEREGRINOS">
      <ElegirNombreRegistro token={params.token} lista={lista} />
    </Marco>
  );
}
