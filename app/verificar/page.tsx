import { COLOR, CONTACTO } from "@/lib/brand";
import { redirect } from "next/navigation";

/**
 * La puerta de la verificación, sin huella todavía.
 *
 * El Informe de Firmas no puede traer su propia huella impresa —la huella se calcula sobre
 * el PDF ya terminado, así que meterla dentro la cambiaría— y por eso remite acá. Quien
 * tiene el archivo calcula su SHA-256, lo pega y comprueba.
 */
export const dynamic = "force-dynamic";

async function comprobar(formData: FormData) {
  "use server";
  const hash = String(formData.get("hash") ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
  redirect(`/verificar/${hash}`);
}

export default function PaginaVerificarIndice() {
  return (
    <main style={{ background: COLOR.alba, minHeight: "100vh" }}>
      <header style={{ background: COLOR.atlantico, padding: "22px 24px" }}>
        <div className="mx-auto" style={{ maxWidth: 640 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 20, letterSpacing: 1.5, color: COLOR.alba }}>
            {CONTACTO.marca}
          </div>
          <div style={{ fontSize: 10, letterSpacing: 2.5, color: COLOR.ocreClaro, marginTop: 10 }}>
            VERIFICACIÓN DE DOCUMENTO
          </div>
        </div>
      </header>

      <div className="mx-auto px-6 py-10" style={{ maxWidth: 640 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, color: COLOR.atlantico, margin: 0 }}>
          Comprueba que tu contrato es auténtico
        </h1>
        <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>
          Cada contrato firmado tiene una huella digital única, impresa en la última página,
          en el Informe de Firmas. Si el documento hubiera sido alterado en un solo carácter,
          su huella sería distinta.
        </p>
        <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>
          Pega aquí la huella que aparece en tu documento:
        </p>

        <form action={comprobar} className="mt-5">
          <textarea
            name="hash"
            rows={3}
            required
            placeholder="720f 1058 28ad 246d 4dd0 8824 1fb3 2b21 a88a e6c3 13d4 bf07 582f 41ee bce0 444b"
            className="w-full rounded border px-4 py-3"
            style={{
              borderColor: COLOR.piedra, background: "#fff", color: COLOR.noche,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13,
            }}
          />
          <button
            type="submit"
            className="mt-3 rounded px-6 py-3"
            style={{
              background: COLOR.ocreProfundo, color: COLOR.alba, fontSize: 12,
              letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700,
            }}
          >
            Comprobar
          </button>
        </form>

        <p style={{ color: COLOR.castano, marginTop: 24, fontSize: 13, lineHeight: 1.6 }}>
          Los espacios no importan: puedes copiarla tal como aparece en el documento. Si algo
          no te cuadra, escríbenos a {CONTACTO.correo}.
        </p>
      </div>
    </main>
  );
}
