import { COLOR, CONTACTO, OVERLAY_FOTO } from "@/lib/brand";

/**
 * El marco de las páginas que ve el peregrino (formulario de registro, carta de bienvenida):
 * la portada de la carta con velo, el logo, el rótulo en Cinzel y el pie con el contacto.
 */
export function MarcoPublico({ titulo, camino, children }: { titulo: string; camino: string; children: React.ReactNode }) {
  return (
    <main style={{ background: COLOR.alba, minHeight: "100vh" }}>
      {/* La misma portada de la carta de bienvenida: lo que reciben tiene que sentirse una sola cosa. */}
      <header style={{ position: "relative", background: COLOR.noche, overflow: "hidden" }}>
        <img src="/bienvenida/portada.jpg" alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: OVERLAY_FOTO }} />
        <div className="relative mx-auto px-6 py-10 text-center" style={{ maxWidth: 760 }}>
          <img src="/bienvenida/logo-blanco.png" alt={CONTACTO.marca} style={{ width: 120, margin: "0 auto" }} />
          <div className="font-seal" style={{ fontSize: 12, letterSpacing: 3, color: COLOR.ocreClaro, marginTop: 18 }}>{titulo}</div>
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

