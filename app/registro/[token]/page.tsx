import Link from "next/link";
import { notFound } from "next/navigation";
import { COLOR, CONTACTO, OVERLAY_FOTO } from "@/lib/brand";
import { resolverEnlace, fichaPorToken } from "@/lib/registro/por-token";
import { BuscarNombre } from "./buscar-nombre";
import { FormularioRegistro } from "./form-registro";

/**
 * El formulario de registro del peregrino. Dos puertas, la misma página:
 *  · `/registro/<token personal>` → su formulario, directo, con lo que ya sabemos de él.
 *  · `/registro/<token del camino>` → escribe su nombre; si coincide, `?yo=<inscripción>`.
 *
 * Es pública: se protege por el token de 256 bits, no por sesión. Está en la lista de rutas
 * públicas del middleware y `next.config.mjs` le pone no-referrer y noindex.
 */
export const dynamic = "force-dynamic";

function Marco({ camino, children }: { camino: string; children: React.ReactNode }) {
  return (
    <main style={{ background: COLOR.alba, minHeight: "100vh" }}>
      {/* La misma portada de la carta de bienvenida: lo que reciben tiene que sentirse una sola cosa. */}
      <header style={{ position: "relative", background: COLOR.noche, overflow: "hidden" }}>
        <img src="/bienvenida/portada.jpg" alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: OVERLAY_FOTO }} />
        <div className="relative mx-auto px-6 py-10 text-center" style={{ maxWidth: 760 }}>
          <img src="/bienvenida/logo-blanco.png" alt={CONTACTO.marca} style={{ width: 120, margin: "0 auto" }} />
          <div className="font-seal" style={{ fontSize: 12, letterSpacing: 3, color: COLOR.ocreClaro, marginTop: 18 }}>REGISTRO DE PEREGRINOS</div>
          <div className="font-display" style={{ fontSize: 24, fontStyle: "italic", color: COLOR.alba, marginTop: 6 }}>{camino}</div>
        </div>
        <div style={{ position: "relative", height: 4, background: COLOR.ocre }} />
      </header>
      <div className="mx-auto px-5 sm:px-6 py-8" style={{ maxWidth: 760 }}>{children}</div>
      <footer className="px-6 py-5 text-center" style={{ background: COLOR.atlantico, color: COLOR.alba, fontSize: 13 }}>
        <div className="font-display" style={{ fontSize: 16, fontStyle: "italic", color: COLOR.ocreClaro, marginBottom: 4 }}>{CONTACTO.mantra}</div>
        {CONTACTO.whatsapp} · {CONTACTO.correo}
      </footer>
    </main>
  );
}

function Inactiva() {
  return (
    <section className="rounded p-6" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
      <h1 className="font-display" style={{ fontSize: 28, color: COLOR.atlantico, margin: 0 }}>Esta inscripción ya no está activa</h1>
      <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>Si crees que es un error, escríbenos por WhatsApp y lo revisamos.</p>
    </section>
  );
}

export default async function PaginaRegistro({ params, searchParams }: { params: { token: string }; searchParams: { yo?: string } }) {
  const enlace = await resolverEnlace(params.token);
  if (!enlace) notFound();

  if (enlace.tipo === "personal") {
    const { ficha, registrationId } = enlace;
    return (
      <Marco camino={ficha.camino}>
        {ficha.estado === "activo" ? <FormularioRegistro token={params.token} registrationId={registrationId} ficha={ficha} /> : <Inactiva />}
      </Marco>
    );
  }

  const yo = searchParams.yo?.trim() || null;
  if (yo) {
    const ficha = await fichaPorToken(params.token, yo);
    if (!ficha) notFound();
    return (
      <Marco camino={ficha.camino}>
        <p style={{ fontSize: 14, color: COLOR.castano, margin: "0 0 16px" }}>
          Estás llenando los datos de <strong style={{ color: COLOR.atlantico }}>{ficha.nombre.split(/\s+/)[0]}</strong>.{" "}
          <Link href={`/registro/${params.token}`} style={{ color: COLOR.ocreProfundo, textDecoration: "underline" }}>
            No soy yo
          </Link>
        </p>
        {ficha.estado !== "activo" ? (
          <Inactiva />
        ) : ficha.bloqueado ? (
          <section className="rounded p-6" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
            <h1 className="font-display" style={{ fontSize: 28, color: COLOR.atlantico, margin: 0 }}>Usa tu enlace personal</h1>
            <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>{ficha.bloqueado}</p>
          </section>
        ) : (
          <FormularioRegistro token={params.token} registrationId={yo} ficha={ficha} />
        )}
      </Marco>
    );
  }

  return (
    <Marco camino={enlace.camino}>
      <BuscarNombre token={params.token} camino={enlace.camino} />
    </Marco>
  );
}
