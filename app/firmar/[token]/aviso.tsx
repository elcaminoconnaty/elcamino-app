import { COLOR } from "@/lib/brand";
import type { ContratoParaFirmar } from "@/lib/contracts/sign";

/**
 * La pantalla para los contratos que no están pendientes de firma.
 *
 * Que un contrato ya firmado tenga su propia pantalla no es un detalle: en Camino Sacro
 * firmar anulaba el token, así que el viajero que volvía a abrir su enlace se topaba con
 * "enlace no válido" justo después de haber firmado. Acá el token sobrevive.
 */
export function Aviso({ contrato }: { contrato: ContratoParaFirmar }) {
  if (contrato.estado === "ya_firmado") {
    return (
      <section
        className="rounded p-6"
        style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}
      >
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, color: COLOR.atlantico, margin: 0 }}>
          Tu contrato ya está firmado
        </h1>
        <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>
          Lo firmaste el {contrato.firmadoEn} y te mandamos una copia en PDF al correo{" "}
          <strong>{contrato.email}</strong>; si no la ves, revisa el spam o escríbenos y te la
          reenviamos.
        </p>
        {contrato.huella && (
          <div className="mt-5" style={{ fontSize: 12, color: COLOR.castano }}>
            <div style={{ letterSpacing: 1.4, textTransform: "uppercase", fontSize: 10, color: COLOR.ocreProfundo }}>
              Huella del documento
            </div>
            <code style={{ wordBreak: "break-all", fontSize: 11 }}>{contrato.huella}</code>
            {contrato.urlVerificacion && (
              <p className="mt-3">
                Para comprobar que el archivo que tienes es exactamente el que firmaste,{" "}
                <a href={contrato.urlVerificacion} style={{ color: COLOR.atlantico, textDecoration: "underline" }}>
                  verificalo acá
                </a>
                .
              </p>
            )}
          </div>
        )}
      </section>
    );
  }

  const texto =
    contrato.estado === "vencido"
      ? "El enlace para firmar venció. Escríbenos por WhatsApp y te mandamos uno nuevo en un minuto — no tienes que volver a empezar nada."
      : "Este contrato fue anulado porque se emitió una versión corregida. Busca en tu correo el más reciente, o escríbenos y te lo reenviamos.";

  return (
    <section className="rounded p-6" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
      <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, color: COLOR.atlantico, margin: 0 }}>
        {contrato.estado === "vencido" ? "El enlace venció" : "Este contrato fue reemplazado"}
      </h1>
      <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>{texto}</p>
    </section>
  );
}
