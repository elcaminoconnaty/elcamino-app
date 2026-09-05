import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { COLOR, CONTACTO } from "@/lib/brand";
import { contratoPorToken } from "@/lib/contracts/sign";
import { FormularioFirma } from "./form-firma";
import { Aviso } from "./aviso";

/**
 * La página que abre el peregrino desde el correo.
 *
 * Es pública: se protege por el token de 256 bits del enlace, no por sesión. Está exenta
 * del middleware y `next.config.mjs` le pone `Referrer-Policy: no-referrer` (para que el
 * token no viaje en la cabecera hacia enlaces salientes) y `noindex`.
 */
export const dynamic = "force-dynamic";

export default async function PaginaFirmar({ params }: { params: { token: string } }) {
  const h = headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const contrato = await contratoPorToken(params.token, { ip, userAgent: h.get("user-agent") });

  if (!contrato) notFound();

  return (
    <main style={{ background: COLOR.alba, minHeight: "100vh" }}>
      <header style={{ background: COLOR.atlantico, padding: "22px 24px" }}>
        <div className="mx-auto" style={{ maxWidth: 760 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 20, letterSpacing: 1.5, color: COLOR.alba }}>
            {CONTACTO.marca}
          </div>
          <div style={{ fontSize: 10, letterSpacing: 2.5, color: COLOR.ocre, marginTop: 10 }}>
            CONTRATO DE VIAJE
          </div>
        </div>
      </header>

      <div className="mx-auto px-6 py-8" style={{ maxWidth: 760 }}>
        {contrato.estado === "por_firmar" ? (
          <FormularioFirma token={params.token} contrato={contrato} />
        ) : (
          <Aviso contrato={contrato} />
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
