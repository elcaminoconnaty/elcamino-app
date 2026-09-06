import { notFound } from "next/navigation";
import { COLOR, CONTACTO } from "@/lib/brand";
import { documentoPorToken } from "@/lib/travel-doc/por-token";
import { fechaBreve } from "@/lib/travel-doc/datos";

/**
 * El documento de viaje que abre el peregrino.
 *
 * Ruta pública: se protege con el token del enlace, no con sesión. Se arma al vuelo, así que
 * muestra siempre lo último — si Naty corrige una hora de desayuno tres semanas antes de
 * salir, acá se ve, sin reenviar nada.
 *
 * Pensada para el celular: es lo que el peregrino va a mirar en la mochila, no en un
 * escritorio.
 */
export const dynamic = "force-dynamic";

export default async function PaginaViaje({ params }: { params: { token: string } }) {
  const doc = await documentoPorToken(params.token);
  if (!doc) notFound();

  return (
    <main style={{ background: COLOR.alba, minHeight: "100vh", color: COLOR.noche, overflowX: "hidden" }}>
      {/* ── Portada ─────────────────────────────────────────────────────────── */}
      <header style={{ background: COLOR.noche, position: "relative", overflow: "hidden" }}>
        {doc.portada.foto && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- el cubo es público */}
            <img
              src={doc.portada.foto}
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
            {/* El brandbook exige velo bajo cualquier texto sobre foto. */}
            <div style={{ position: "absolute", inset: 0, background: "rgba(26,46,61,0.55)" }} />
          </>
        )}
        <div
          className="mx-auto px-6 text-center"
          style={{ maxWidth: 780, position: "relative", paddingBlock: "72px 56px" }}
        >
          {doc.recorrido && (
            <p style={{ color: COLOR.alba, fontSize: 13, margin: 0, opacity: 0.9 }}>
              {doc.recorrido}
              {doc.km ? ` · ${doc.km.toLocaleString("es-CO")} km` : ""}
            </p>
          )}
          <h1
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "clamp(2.4rem, 9vw, 4rem)",
              letterSpacing: "0.12em",
              color: COLOR.alba,
              margin: "14px 0 0",
              fontWeight: 700,
            }}
          >
            CAMINO
          </h1>
          <p
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontStyle: "italic",
              fontSize: "clamp(1.2rem, 4vw, 1.7rem)",
              color: COLOR.ocreClaro,
              margin: "2px 0 0",
            }}
          >
            de Santiago
          </p>
          <p
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              color: COLOR.alba,
              fontSize: "1.05rem",
              marginTop: 32,
            }}
          >
            {doc.portada.tagline}
          </p>
        </div>
        <div style={{ background: COLOR.atlantico, padding: "16px 24px", position: "relative" }}>
          <div className="mx-auto" style={{ maxWidth: 780 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.2em", color: COLOR.alba, textTransform: "uppercase" }}>
              {doc.portada.banda}
            </div>
            <div style={{ fontSize: 11, letterSpacing: "0.2em", color: COLOR.ocreClaro, marginTop: 4 }}>
              {doc.etiqueta}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto px-6" style={{ maxWidth: 780, paddingBlock: 48, minWidth: 0 }}>
        <a
          href={`/api/pdf/viaje/${params.token}`}
          style={{
            display: "inline-block",
            background: COLOR.ocreProfundo,
            color: COLOR.alba,
            padding: "12px 24px",
            fontSize: 12,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 700,
            borderRadius: 4,
            textDecoration: "none",
          }}
        >
          Descargar en PDF
        </a>
        <p style={{ fontSize: 13, color: COLOR.castano, marginTop: 10 }}>
          Para llevarlo en el celular sin depender de la señal. Esta página siempre tiene lo
          último, así que si algo cambia, acá lo vas a ver.
        </p>

        {/* ── Itinerario ────────────────────────────────────────────────────── */}
        <h2 style={tituloSeccion}>Itinerario</h2>
        <div style={{ borderTop: `1px solid ${COLOR.piedra}` }}>
          {doc.dias.map((d) => (
            <div
              key={d.fecha + d.rotulo}
              style={{
                display: "grid",
                gridTemplateColumns: "84px minmax(0, 1fr)",
                gap: 16,
                padding: "14px 0",
                borderBottom: `1px solid #EFE5D6`,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{fechaBreve(d.fecha)}</div>
                <div style={{ fontSize: 11, color: COLOR.ocreProfundo }}>{d.rotulo}</div>
              </div>
              <div>
                <div style={{ fontSize: 15 }}>{d.lugar || "—"}</div>
                {d.km ? (
                  <div style={{ fontSize: 12, color: COLOR.castano, marginTop: 2 }}>
                    {d.km.toLocaleString("es-CO")} km{d.horas ? ` · ${d.horas}` : ""}
                  </div>
                ) : null}
                {d.alojamiento && (
                  <div style={{ fontSize: 13, color: COLOR.atlantico, marginTop: 4 }}>{d.alojamiento}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Alojamientos ──────────────────────────────────────────────────── */}
        <h2 style={tituloSeccion}>Dónde vas a dormir</h2>
        <div style={{ display: "grid", gap: 40, minWidth: 0 }}>
          {doc.alojamientos.map((a) => (
            <section key={a.clave} style={{ minWidth: 0 }}>
              <h3
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "1.25rem",
                  color: COLOR.atlantico,
                  margin: 0,
                  letterSpacing: "0.04em",
                }}
              >
                {a.ciudad ? `${a.ciudad}: ` : ""}
                {a.nombre}
              </h3>
              <p style={{ fontSize: 12, color: COLOR.ocreProfundo, margin: "4px 0 14px" }}>
                {[a.etapa, a.noches > 1 ? `${a.noches} noches · ${fechaBreve(a.desde)} → ${fechaBreve(a.hasta)}` : fechaBreve(a.desde)]
                  .filter(Boolean)
                  .join("  ·  ")}
              </p>

              {a.fotos.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, marginBottom: 16 }}>
                  {a.fotos.slice(0, 3).map((f, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- el cubo es público
                    <img key={i} src={f.url} alt="" style={{ width: "100%", aspectRatio: "3/2", objectFit: "cover" }} />
                  ))}
                </div>
              )}

              <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: "12px 28px", margin: 0, minWidth: 0 }}>
                {a.checkIn && <Dato k="Entrada" v={`${fechaBreve(a.desde)} · ${a.checkIn}`} />}
                {a.acomodacion && <Dato k="Acomodación" v={a.acomodacion} />}
                {a.direccion && (
                  <Dato
                    k="Dirección"
                    v={a.direccion}
                    href={a.mapsUrl ?? `https://www.google.com/maps/search/${encodeURIComponent(`${a.nombre} ${a.direccion}`)}`}
                  />
                )}
                {a.desayuno && <Dato k="Desayuno" v={a.desayuno} />}
              </dl>

              {a.compartidoCon && (
                <p
                  style={{
                    marginTop: 14,
                    background: COLOR.piedra,
                    borderLeft: `3px solid ${COLOR.ocre}`,
                    padding: "10px 12px",
                    fontSize: 13,
                    color: COLOR.castano,
                  }}
                >
                  Esta noche el grupo se reparte entre {a.nombre} y {a.compartidoCon}. Te decimos cuál te
                  toca antes de salir.
                </p>
              )}
            </section>
          ))}
        </div>
      </div>

      <footer style={{ background: COLOR.atlantico, color: COLOR.alba, padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-seal), Georgia, serif", letterSpacing: "0.2em", fontSize: 14 }}>
          EL CAMINO CON NATY
        </div>
        <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic", color: COLOR.ocreClaro, marginTop: 8 }}>
          Buen Camino
        </div>
        <div style={{ fontSize: 12, marginTop: 20, opacity: 0.85 }}>
          {CONTACTO.whatsapp} · {CONTACTO.correo}
        </div>
      </footer>
    </main>
  );
}

const tituloSeccion: React.CSSProperties = {
  fontFamily: "var(--font-display), Georgia, serif",
  fontSize: "1.6rem",
  color: COLOR.atlantico,
  margin: "56px 0 20px",
  fontWeight: 600,
};

function Dato({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div>
      <dt style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: COLOR.ocreProfundo }}>
        {k}
      </dt>
      <dd style={{ margin: "3px 0 0", fontSize: 14.5, lineHeight: 1.45 }}>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" style={{ color: COLOR.noche }}>
            {v}
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}
