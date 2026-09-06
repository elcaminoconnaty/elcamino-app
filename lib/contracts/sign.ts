import "server-only";
// El peregrino no tiene cuenta: todo este módulo corre sin sesión y se autoriza con el
// token del enlace, que se comprueba antes de cada consulta. Ver lib/supabase/admin.ts.
import { createAdminClient as createClient } from "@/lib/supabase/admin";
import { minutaVigente } from "./minuta.server";
import type { DatosContrato } from "./minuta";
import { renderContrato } from "./render";
import type { FirmanteInforme, InformeFirmasProps } from "@/components/pdf/informe-firmas";
import {
  hashCodigo, huellaLegible, mismoHash, nuevoCodigo,
  OTP_MAX_INTENTOS, OTP_VIGENCIA_MIN, textoConsentimiento, tokenPlausible, trazoValido,
} from "./firma";

/**
 * El motor de firma.
 *
 * En Colombia la firma electrónica simple es válida bajo la Ley 527 de 1999 (art. 7) y el
 * Decreto 2364 de 2012, siempre que sea confiable: que los datos de creación estén bajo
 * control exclusivo del firmante, que sea verificable y que se pueda detectar cualquier
 * alteración. No hace falta entidad certificadora.
 *
 * Acá eso se traduce en cuatro cosas, y las cuatro tienen que estar:
 *
 * 1. **Control exclusivo** — un código de un solo uso al correo del firmante, que es el
 *    mismo que aparece en el contrato como dirección de notificaciones.
 * 2. **Consentimiento sobre el método** — dos casillas explícitas, y el texto exacto que
 *    aceptó se archiva con la firma.
 * 3. **Evidencia** — IP, dispositivo, momento de cada paso y el trazo del canvas.
 * 4. **Integridad** — SHA-256 del PDF, impreso en el Informe de Firmas y comprobable en una
 *    página pública.
 */

const zonaBogota = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", dateStyle: "long", timeStyle: "medium",
});
const enBogota = (d: Date | string) => zonaBogota.format(typeof d === "string" ? new Date(d) : d);

export type Huella = { ip: string | null; userAgent: string | null };

async function anotar(
  contractId: string,
  event: string,
  extra?: { signerId?: string | null; huella?: Huella; detail?: unknown }
) {
  try {
    const supabase = createClient();
    await supabase.from("contract_events").insert({
      contract_id: contractId,
      signer_id: extra?.signerId ?? null,
      event,
      ip: extra?.huella?.ip ?? null,
      user_agent: extra?.huella?.userAgent ?? null,
      detail: extra?.detail ?? null,
    });
  } catch {
    // Nunca tumbamos una firma por no poder anotar.
  }
}

export type ContratoParaFirmar = {
  contractId: string;
  estado: "por_firmar" | "ya_firmado" | "vencido" | "anulado";
  codigo: string;
  nombre: string;
  documento: string;
  email: string;
  camino: string;
  valorTotal: string;
  formaDePago: string;
  firmadoEn: string | null;
  huella: string | null;
  urlVerificacion: string | null;
};

/**
 * Lo que ve quien abre el enlace. Devuelve `null` solo si el token no existe: un contrato
 * ya firmado o vencido tiene su propia pantalla, porque en Camino Sacro el viajero que
 * volvía a abrir su contrato firmado se topaba con "enlace no válido".
 */
export async function contratoPorToken(token: string, huella?: Huella): Promise<ContratoParaFirmar | null> {
  if (!tokenPlausible(token)) return null;
  const supabase = createClient();

  const { data: c } = await supabase
    .from("contracts")
    .select(
      `id, status, snapshot, signed_at, token_expires_at, pdf_signed_sha256, access_token,
       registrations:registration_id ( departures:departure_id ( name ) )`
    )
    .eq("access_token", token)
    .maybeSingle();
  if (!c) return null;

  const s = c.snapshot as DatosContrato;
  const vencido = c.token_expires_at != null && new Date(c.token_expires_at) < new Date();

  const estado: ContratoParaFirmar["estado"] =
    c.status === "firmado" ? "ya_firmado"
    : c.status === "anulado" ? "anulado"
    : vencido ? "vencido"
    : "por_firmar";

  // Solo anotamos la apertura la primera vez que se abre pendiente de firma.
  if (estado === "por_firmar" && c.status === "enviado") {
    await supabase.from("contracts").update({ status: "visto", viewed_at: new Date().toISOString() }).eq("id", c.id);
    await anotar(c.id, "abierto", { huella });
  }

  return {
    contractId: c.id,
    estado,
    codigo: String(c.access_token).slice(0, 8).toUpperCase(),
    nombre: s.viajero_nombre,
    documento: s.viajero_documento_label,
    email: s.viajero_email,
    camino: (c.registrations as any)?.departures?.name ?? "tu Camino",
    valorTotal: s.valor_total,
    formaDePago: s.forma_de_pago,
    firmadoEn: c.signed_at ? enBogota(c.signed_at) : null,
    huella: c.pdf_signed_sha256 ? huellaLegible(c.pdf_signed_sha256) : null,
    urlVerificacion: c.pdf_signed_sha256
      ? `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/verificar/${c.pdf_signed_sha256}`
      : null,
  };
}

/** Manda el código al correo del firmante. */
export async function pedirCodigo(token: string, huella?: Huella): Promise<{ ok: boolean; error?: string }> {
  if (!tokenPlausible(token)) return { ok: false, error: "Enlace no válido." };
  const supabase = createClient();

  const { data: c } = await supabase
    .from("contracts")
    .select("id, status, token_expires_at")
    .eq("access_token", token)
    .maybeSingle();
  if (!c) return { ok: false, error: "Enlace no válido." };
  if (c.status === "firmado") return { ok: false, error: "Este contrato ya está firmado." };
  if (c.status === "anulado") return { ok: false, error: "Este contrato fue anulado." };
  if (c.token_expires_at && new Date(c.token_expires_at) < new Date()) {
    return { ok: false, error: "El enlace venció. Escribinos y te mandamos uno nuevo." };
  }

  const { data: firmante } = await supabase
    .from("contract_signers")
    .select("id, full_name, email")
    .eq("contract_id", c.id)
    .eq("role", "viajero")
    .single();
  if (!firmante) return { ok: false, error: "No encontré al firmante." };

  // Freno simple: como mucho ocho códigos por hora. Holgado a propósito — una pareja firma
  // desde el mismo wifi y con el mismo correo de referencia.
  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase
    .from("contract_otps")
    .select("id", { count: "exact", head: true })
    .eq("signer_id", firmante.id)
    .gte("created_at", haceUnaHora);
  if ((count ?? 0) >= 8) {
    return { ok: false, error: "Pediste muchos códigos seguidos. Esperá una hora y volvé a intentar." };
  }

  const codigo = nuevoCodigo();
  await supabase.from("contract_otps").insert({
    signer_id: firmante.id,
    code_hash: hashCodigo(codigo, firmante.id),
    expires_at: new Date(Date.now() + OTP_VIGENCIA_MIN * 60_000).toISOString(),
  });

  const { enviarCorreo } = await import("@/lib/email/send");
  const { correoCodigoDeFirma } = await import("@/lib/email/templates");
  const correo = correoCodigoDeFirma({ nombre: firmante.full_name, codigo, minutos: OTP_VIGENCIA_MIN });
  const r = await enviarCorreo({ ...correo, to: firmante.email, tipo: "contrato_firmar", templateSlug: "codigo_firma" });

  await anotar(c.id, r.ok ? "otp_enviado" : "otp_fallido", {
    signerId: firmante.id, huella, detail: r.ok ? null : { error: r.error },
  });

  return r.ok ? { ok: true } : { ok: false, error: `No pude mandar el código: ${r.error}` };
}

export type ResultadoFirma =
  | { ok: true; huella: string; urlVerificacion: string }
  | { ok: false; error: string };

/**
 * Firma el contrato: valida el código, sella el PDF con las dos firmas y el Informe de
 * Firmas, y lo guarda.
 */
export async function firmarContrato(args: {
  token: string;
  codigo: string;
  trazoDataUrl: string;
  aceptaLectura: boolean;
  aceptaFirma: boolean;
  huella?: Huella;
  geo?: string | null;
}): Promise<ResultadoFirma> {
  const { token, codigo, trazoDataUrl, aceptaLectura, aceptaFirma, huella, geo } = args;

  if (!tokenPlausible(token)) return { ok: false, error: "Enlace no válido." };
  if (!aceptaLectura || !aceptaFirma) {
    return { ok: false, error: "Hay que marcar las dos casillas para poder firmar." };
  }
  const trazo = trazoValido(trazoDataUrl);
  if (!trazo.ok) return { ok: false, error: trazo.error };

  const supabase = createClient();

  const { data: c } = await supabase
    .from("contracts")
    .select(
      `id, status, snapshot, template_version, created_at, token_expires_at, access_token,
       registrations:registration_id ( departures:departure_id ( name ) )`
    )
    .eq("access_token", token)
    .maybeSingle();
  if (!c) return { ok: false, error: "Enlace no válido." };
  if (c.status === "firmado") return { ok: false, error: "Este contrato ya está firmado." };
  if (c.status === "anulado") return { ok: false, error: "Este contrato fue anulado." };
  if (c.token_expires_at && new Date(c.token_expires_at) < new Date()) {
    return { ok: false, error: "El enlace venció. Escribinos y te mandamos uno nuevo." };
  }

  const { data: firmantes } = await supabase
    .from("contract_signers")
    .select("id, role, full_name, document_label, email, phone, signature_image_path, signed_at")
    .eq("contract_id", c.id);
  const viajero = firmantes?.find((f) => f.role === "viajero");
  const camino = firmantes?.find((f) => f.role === "camino");
  if (!viajero || !camino) return { ok: false, error: "Al contrato le faltan firmantes." };

  // --- El código ---
  const { data: otp } = await supabase
    .from("contract_otps")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("signer_id", viajero.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otp) return { ok: false, error: "Pedí el código primero." };
  if (new Date(otp.expires_at) < new Date()) {
    return { ok: false, error: "El código venció. Pedí uno nuevo." };
  }
  if (otp.attempts >= OTP_MAX_INTENTOS) {
    return { ok: false, error: "Demasiados intentos con ese código. Pedí uno nuevo." };
  }
  if (!mismoHash(hashCodigo(codigo.trim(), viajero.id), otp.code_hash)) {
    await supabase.from("contract_otps").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
    await anotar(c.id, "otp_fallido", { signerId: viajero.id, huella });
    const quedan = OTP_MAX_INTENTOS - otp.attempts - 1;
    return {
      ok: false,
      error: quedan > 0 ? `El código no coincide. Te quedan ${quedan} intentos.` : "Se acabaron los intentos. Pedí un código nuevo.",
    };
  }
  await supabase.from("contract_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
  await anotar(c.id, "otp_validado", { signerId: viajero.id, huella });

  // --- El trazo ---
  // Se sube antes de sellar porque el PDF lo necesita; si el sellado falla, el objeto queda
  // huérfano, así que se limpia en el catch.
  const rutaTrazo = `${new Date().getFullYear()}/${c.id}/firma-viajero.png`;
  const { error: errTrazo } = await supabase.storage
    .from("contracts")
    .upload(rutaTrazo, trazo.bytes, { contentType: "image/png", upsert: true });
  if (errTrazo) return { ok: false, error: `No pude guardar la firma: ${errTrazo.message}` };

  try {
    const ahora = new Date();
    const s = c.snapshot as DatosContrato;
    const minuta = await minutaVigente();
    const codigoDoc = String(c.access_token).slice(0, 8).toUpperCase();

    // El trazo guardado de Naty, capturado una sola vez en Configuración.
    const { data: ajuste } = await supabase
      .from("app_settings").select("value").eq("key", "org_signature").maybeSingle();
    const trazoNaty = (ajuste?.value as any)?.data_url as string | undefined;

    // Primera pasada: sin informe, para saber de cuántas páginas consta el contrato.
    const primera = await renderContrato({
      minuta, datos: s, codigo: codigoDoc,
      trazos: { viajero: trazoDataUrl, camino: trazoNaty },
    });

    const fichas: FirmanteInforme[] = [
      {
        rol: "camino", rolTexto: "El Camino con Naty",
        nombre: camino.full_name, documento: camino.document_label, email: camino.email,
        telefono: camino.phone, firmadoEn: enBogota(camino.signed_at ?? c.created_at),
        ip: null, dispositivo: null, ubicacion: null,
        metodo: "Firmado desde la plataforma, con sesión autenticada",
        trazo: trazoNaty ?? null,
      },
      {
        rol: "viajero", rolTexto: "El Viajero",
        nombre: viajero.full_name, documento: viajero.document_label, email: viajero.email,
        telefono: viajero.phone, firmadoEn: enBogota(ahora),
        ip: huella?.ip ?? null, dispositivo: huella?.userAgent ?? null, ubicacion: geo ?? null,
        metodo: "Validado por código único enviado por correo electrónico",
        trazo: trazoDataUrl,
      },
    ];

    const informe: InformeFirmasProps = {
      numero: codigoDoc,
      creadoEn: enBogota(c.created_at),
      documento: `${minuta.titulo} · ${s.plan_descripcion}`,
      huellaOriginal: huellaLegible(primera.sha256),
      urlVerificacion: `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/verificar`,
      firmantes: fichas,
      paginas: primera.paginas + 1,
    };

    // Segunda pasada: el documento definitivo, con el Informe de Firmas al final.
    const sellado = await renderContrato({
      minuta, datos: s, codigo: codigoDoc,
      trazos: { viajero: trazoDataUrl, camino: trazoNaty },
      informe,
    });

    const rutaFirmado = `${ahora.getFullYear()}/${c.id}/Contrato-${codigoDoc}-firmado.pdf`;
    const { error: errPdf } = await supabase.storage
      .from("contracts")
      .upload(rutaFirmado, sellado.pdf, { contentType: "application/pdf", upsert: true });
    if (errPdf) throw new Error(errPdf.message);

    await supabase.from("contract_signers").update({
      signed_at: ahora.toISOString(),
      signature_image_path: rutaTrazo,
      auth_method: "otp_email",
      ip: huella?.ip ?? null,
      user_agent: huella?.userAgent ?? null,
      geo: geo ?? null,
      consent_text: textoConsentimiento(),
    }).eq("id", viajero.id);

    if (!camino.signed_at) {
      await supabase.from("contract_signers").update({
        signed_at: ahora.toISOString(), auth_method: "sesion_plataforma",
      }).eq("id", camino.id);
    }

    // Cierre condicional: si dos pestañas firman a la vez, solo una cierra. El token NO se
    // anula — el peregrino tiene que poder volver a abrir su contrato y verlo firmado.
    const { data: cerrado } = await supabase
      .from("contracts")
      .update({
        status: "firmado",
        signed_at: ahora.toISOString(),
        pdf_signed_path: rutaFirmado,
        pdf_signed_sha256: sellado.sha256,
      })
      .eq("id", c.id)
      .in("status", ["borrador", "enviado", "visto"])
      .select("id")
      .maybeSingle();

    if (!cerrado) return { ok: false, error: "Este contrato acaba de ser firmado en otra ventana." };

    await anotar(c.id, "firmado", { signerId: viajero.id, huella, detail: { sha256: sellado.sha256 } });
    await anotar(c.id, "pdf_sellado", { detail: { paginas: sellado.paginas, ruta: rutaFirmado } });

    const urlVerificacion = `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/verificar/${sellado.sha256}`;
    const nombreCamino = (c.registrations as any)?.departures?.name ?? "tu Camino";

    // La copia al peregrino y el aviso a Naty van en envíos separados y después de cerrar la
    // firma: si el correo falla, la firma sigue siendo válida y ella se entera igual. En
    // Camino Sacro las dos ramas iban en serie y un adjunto rechazado apagaba las dos.
    const { enviarCorreo, avisoInterno } = await import("@/lib/email/send");
    const { correoContratoFirmado } = await import("@/lib/email/templates");
    const nombreAdjunto = `Contrato-${codigoDoc}-firmado.pdf`;

    await enviarCorreo({
      ...correoContratoFirmado({
        nombre: viajero.full_name,
        camino: nombreCamino,
        fechaFirma: enBogota(ahora),
        huella: huellaLegible(sellado.sha256),
        urlVerificacion,
        nombreAdjunto,
      }),
      to: viajero.email,
      tipo: "contrato_firmado",
      templateSlug: "contrato_firmado",
      adjuntos: [{ filename: nombreAdjunto, content: sellado.pdf, contentType: "application/pdf" }],
    });

    await avisoInterno(
      `Firmó ${viajero.full_name}`,
      `${viajero.full_name} (${viajero.document_label}) acaba de firmar su contrato del ${nombreCamino}.\n\n` +
        `Firmado: ${enBogota(ahora)}\nIP: ${huella?.ip ?? "—"}\nHuella: ${sellado.sha256}\n` +
        `Verificación: ${urlVerificacion}`
    );

    return { ok: true, huella: sellado.sha256, urlVerificacion };
  } catch (e: any) {
    // El trazo ya subido no puede quedar suelto.
    await supabase.storage.from("contracts").remove([rutaTrazo]).catch(() => {});
    return { ok: false, error: e?.message ?? "No pude sellar el documento." };
  }
}
