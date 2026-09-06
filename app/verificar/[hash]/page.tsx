import { createAdminClient } from "@/lib/supabase/admin";
import { COLOR, CONTACTO } from "@/lib/brand";
import { huellaLegible } from "@/lib/contracts/firma";

/**
 * La comprobación pública de integridad.
 *
 * Cualquiera con la huella que aparece en el Informe de Firmas puede entrar acá y confirmar
 * que ese documento existe, cuándo se firmó y quiénes lo firmaron. Es lo que sostiene el
 * requisito legal de "poder detectar cualquier alteración": si alguien cambia un carácter
 * del PDF, su huella deja de coincidir con esta.
 *
 * No muestra el contrato ni datos de contacto — solo lo justo para acreditar. Quien tiene
 * derecho a leerlo ya lo tiene.
 */
export const dynamic = "force-dynamic";

const fecha = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short",
});

export default async function PaginaVerificar({ params }: { params: { hash: string } }) {
  const hash = params.hash.toLowerCase().replace(/\s/g, "");
  const valido = /^[0-9a-f]{64}$/.test(hash);

  const supabase = createAdminClient();
  const { data: c } = valido
    ? await supabase
        .from("contracts")
        .select("id, signed_at, template_version, snapshot, contract_signers ( role, full_name, document_label, signed_at )")
        .eq("pdf_signed_sha256", hash)
        .maybeSingle()
    : { data: null };

  return (
    <main style={{ background: COLOR.alba, minHeight: "100vh" }}>
      <header style={{ background: COLOR.atlantico, padding: "22px 24px" }}>
        <div className="mx-auto" style={{ maxWidth: 640 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 20, letterSpacing: 1.5, color: COLOR.alba }}>
            {CONTACTO.marca}
          </div>
          <div style={{ fontSize: 10, letterSpacing: 2.5, color: COLOR.ocre, marginTop: 10 }}>
            VERIFICACIÓN DE DOCUMENTO
          </div>
        </div>
      </header>

      <div className="mx-auto px-6 py-10" style={{ maxWidth: 640 }}>
        {c ? (
          <>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, color: COLOR.atlantico, margin: 0 }}>
              Documento auténtico
            </h1>
            <p style={{ color: COLOR.castano, marginTop: 10, lineHeight: 1.6 }}>
              Esta huella corresponde a un contrato firmado electrónicamente en la plataforma de{" "}
              {CONTACTO.marca}, conforme a la Ley 527 de 1999. Si el archivo que tienes produce esta
              misma huella, es exactamente el que se firmó.
            </p>

            <div className="rounded p-5 mt-6" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
              <Dato k="Firmado el" v={c.signed_at ? fecha.format(new Date(c.signed_at)) : "—"} />
              <Dato k="Versión de la minuta" v={c.template_version} />
              {((c.contract_signers as any[]) ?? []).map((f) => (
                <Dato
                  key={f.role}
                  k={f.role === "camino" ? "El Camino con Naty" : "El Viajero"}
                  v={`${f.full_name} · ${f.document_label}`}
                />
              ))}
            </div>

            <div className="mt-6" style={{ fontSize: 11, color: COLOR.castano }}>
              <div style={{ letterSpacing: 1.4, textTransform: "uppercase", fontSize: 10, color: COLOR.ocre }}>
                Huella SHA-256
              </div>
              <code style={{ wordBreak: "break-all" }}>{huellaLegible(hash)}</code>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, color: COLOR.atlantico, margin: 0 }}>
              No encontramos ese documento
            </h1>
            <p style={{ color: COLOR.castano, marginTop: 10, lineHeight: 1.6 }}>
              {valido
                ? "Ninguno de nuestros contratos firmados tiene esa huella. Puede que el archivo haya cambiado desde que se firmó, o que la huella se haya copiado con algún error."
                : "Una huella SHA-256 son 64 caracteres entre 0-9 y a-f. Revisá que la hayas copiado completa."}
            </p>
            <p style={{ color: COLOR.castano, marginTop: 14, fontSize: 13 }}>
              Si crees que es un error, escríbenos a {CONTACTO.correo}.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 py-1.5 text-sm">
      <span style={{ color: COLOR.castano, minWidth: 150, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>{k}</span>
      <span style={{ color: COLOR.noche }}>{v}</span>
    </div>
  );
}
