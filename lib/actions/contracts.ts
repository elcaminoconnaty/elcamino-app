"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { minutaVigente } from "@/lib/contracts/minuta.server";
import { camposFaltantes, type DatosContrato } from "@/lib/contracts/minuta";
import { armarDatosContrato, type RevisionContrato } from "@/lib/contracts/datos";
import { nuevoToken, TOKEN_VIGENCIA_DIAS } from "@/lib/contracts/firma";
import { renderContrato } from "@/lib/contracts/render";
import { enviarCorreo, avisoInterno, nuevoTokenCorreo } from "@/lib/email/send";
import { correoContratoParaFirmar } from "@/lib/email/templates";
import { CONTACTO } from "@/lib/brand";

/**
 * Las acciones del módulo de contratos.
 *
 * Dos reglas que atraviesan todo el archivo:
 *
 * - **Un contrato firmado no se toca.** Corregirlo crea una versión nueva y anula la
 *   anterior. En Camino Sacro no había forma de modificar lo firmado y las tres salidas
 *   eran malas: el contrato miente, se borra y se destruye la prueba, o se arregla por
 *   WhatsApp.
 * - **El estado `enviado` solo se marca si el correo salió.** Si no, Naty creería que el
 *   peregrino lo tiene cuando no le llegó nada.
 */

const RUTA_PEREGRINO = (id: string) => `/peregrinos/${id}`;

/**
 * El contrato se ve en dos sitios: la ficha del peregrino y la pestaña Contratos del camino.
 * Se revalidan los dos siempre, porque desde la pestaña se emite igual que desde la ficha y
 * si no se queda mostrando el estado anterior. Va el patrón de la ruta —no un id— porque acá
 * no sabemos de qué salida es la inscripción.
 */
function revalidarContrato(pilgrimId: string) {
  revalidatePath(RUTA_PEREGRINO(pilgrimId));
  revalidatePath("/caminos/[id]", "page");
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Registra un evento en la bitácora. Nunca lanza: la evidencia no puede tumbar la acción. */
async function anotar(
  contractId: string,
  event: string,
  detalle?: { signerId?: string | null; ip?: string | null; userAgent?: string | null; detail?: unknown }
) {
  try {
    const supabase = createClient();
    await supabase.from("contract_events").insert({
      contract_id: contractId,
      signer_id: detalle?.signerId ?? null,
      event,
      ip: detalle?.ip ?? null,
      user_agent: detalle?.userAgent ?? null,
      detail: detalle?.detail ?? null,
    });
  } catch {
    // Silencio: no perdemos la acción por no poder anotar.
  }
}

/**
 * Qué diría el contrato de esta inscripción y qué falta para poder emitirlo.
 * No escribe nada: es lo que ve Naty antes de generar.
 */
export async function revisarContrato(
  registrationId: string,
  opciones?: { anexo1Url?: string; formaDePagoManual?: string }
): Promise<RevisionContrato> {
  const { datos, pendientes, avisos } = await armarDatosContrato(registrationId, opciones);
  const faltan = camposFaltantes(datos);
  return { datos, pendientes, avisos, listo: pendientes.length === 0 && faltan.length === 0 };
}

/**
 * Genera el contrato en borrador: congela los trece campos, renderiza el PDF sin firmas,
 * lo guarda y calcula su huella.
 */
export async function generarContrato(
  registrationId: string,
  pilgrimId: string,
  opciones?: { anexo1Url?: string; formaDePagoManual?: string }
) {
  const supabase = createClient();

  const { datos, pendientes } = await armarDatosContrato(registrationId, opciones);
  if (pendientes.length) {
    throw new Error(
      `Falta ${pendientes.map((p) => p.que_falta).join("; ")}. Completalo antes de generar el contrato.`
    );
  }
  const faltan = camposFaltantes(datos);
  if (faltan.length) throw new Error(`Faltan datos del contrato: ${faltan.join(", ")}.`);

  // Si ya hay uno vivo, este es su reemplazo: se anula el anterior y sube la versión.
  const { data: vigente } = await supabase
    .from("contracts")
    .select("id, version, status")
    .eq("registration_id", registrationId)
    .in("status", ["borrador", "enviado", "visto", "firmado"])
    .maybeSingle();

  if (vigente?.status === "firmado") {
    throw new Error(
      "Este contrato ya está firmado. Para cambiarlo hay que anularlo y emitir una versión nueva, " +
        "que el peregrino tendrá que volver a firmar."
    );
  }

  const minuta = await minutaVigente();
  const version = (vigente?.version ?? 0) + 1;
  const token = nuevoToken();
  const codigo = token.slice(0, 8).toUpperCase();

  const { pdf, sha256: huella } = await renderContrato({
    minuta,
    datos: datos as DatosContrato,
    codigo,
  });

  const anio = new Date().getFullYear();
  const ruta = `${anio}/${registrationId}/Contrato-${codigo}-v${version}.pdf`;
  const { error: errSubida } = await supabase.storage
    .from("contracts")
    .upload(ruta, pdf, { contentType: "application/pdf", upsert: true });
  if (errSubida) throw new Error(`No pude guardar el PDF: ${errSubida.message}`);

  if (vigente) {
    await supabase.from("contracts").update({ status: "anulado", revoked_at: new Date().toISOString() }).eq("id", vigente.id);
    await anotar(vigente.id, "anulado", { detail: { motivo: `reemplazado por la versión ${version}` } });
  }

  const { data: creado, error } = await supabase
    .from("contracts")
    .insert({
      registration_id: registrationId,
      parent_contract_id: vigente?.id ?? null,
      version,
      status: "borrador",
      snapshot: datos,
      template_version: minuta.version,
      pdf_original_path: ruta,
      pdf_original_sha256: huella,
      access_token: token,
      token_expires_at: new Date(Date.now() + TOKEN_VIGENCIA_DIAS * 864e5).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Los dos firmantes. Naty firma desde la plataforma; el viajero, por enlace.
  await supabase.from("contract_signers").insert([
    {
      contract_id: creado.id,
      role: "viajero",
      full_name: datos.viajero_nombre!,
      document_label: datos.viajero_documento_label!,
      email: datos.viajero_email!,
    },
    {
      contract_id: creado.id,
      role: "camino",
      full_name: "NATALIA LARGO DURÁN",
      document_label: "C.C. 1.037.593.713",
      email: CONTACTO.correo,
    },
  ]);

  await anotar(creado.id, "creado", { detail: { version, minuta: minuta.version, sha256: huella } });
  revalidarContrato(pilgrimId);
  return { contractId: creado.id, codigo, version };
}

/** Manda el contrato a firmar. Solo marca `enviado` si el correo salió de verdad. */
export async function enviarContratoAFirmar(contractId: string, pilgrimId: string) {
  const supabase = createClient();

  const { data: c, error } = await supabase
    .from("contracts")
    .select(
      `id, status, access_token, snapshot, version,
       registrations:registration_id ( departures:departure_id ( name ) )`
    )
    .eq("id", contractId)
    .single();
  if (error || !c) throw new Error(error?.message ?? "No encontré el contrato.");
  if (c.status === "firmado") throw new Error("Este contrato ya está firmado.");
  if (c.status === "anulado") throw new Error("Este contrato está anulado.");

  const s = c.snapshot as DatosContrato;
  const camino = (c.registrations as any)?.departures?.name ?? "tu Camino";
  const tokenWeb = nuevoTokenCorreo();
  const urlFirma = `${baseUrl()}/firmar/${c.access_token}`;

  const correo = correoContratoParaFirmar({
    nombre: s.viajero_nombre,
    camino,
    valorTotal: s.valor_total,
    formaDePago: s.forma_de_pago,
    urlFirma,
    urlVersionWeb: `${baseUrl()}/correo/${tokenWeb}`,
  });

  const r = await enviarCorreo({
    ...correo,
    to: s.viajero_email,
    tipo: "contrato_firmar",
    templateSlug: "contrato_firmar",
    tokenVersionWeb: tokenWeb,
  });

  if (!r.ok) {
    await anotar(contractId, "enviado", { detail: { error: r.error } });
    throw new Error(`No pude enviar el correo: ${r.error}`);
  }

  // Renovamos la vigencia del enlace: el del último correo siempre tiene que funcionar.
  await supabase
    .from("contracts")
    .update({
      status: "enviado",
      sent_at: new Date().toISOString(),
      token_expires_at: new Date(Date.now() + TOKEN_VIGENCIA_DIAS * 864e5).toISOString(),
      reminder_count: 0,
    })
    .eq("id", contractId);

  await anotar(contractId, "enviado", { detail: { to: s.viajero_email, messageId: r.messageId } });
  revalidarContrato(pilgrimId);
  return { ok: true as const };
}

/** Anula el contrato vigente sin crear otro. */
export async function anularContrato(contractId: string, pilgrimId: string, motivo?: string) {
  const supabase = createClient();
  const { data: c } = await supabase.from("contracts").select("status").eq("id", contractId).single();
  if (c?.status === "firmado") {
    throw new Error("Un contrato firmado no se anula: se emite una versión nueva que lo reemplaza.");
  }
  await supabase
    .from("contracts")
    .update({ status: "anulado", revoked_at: new Date().toISOString() })
    .eq("id", contractId);
  await anotar(contractId, "anulado", { detail: { motivo: motivo ?? null } });
  revalidarContrato(pilgrimId);
}

/** URL firmada de corta vida para descargar el PDF. Nada se sirve directo desde Storage. */
export async function urlDescargaContrato(contractId: string): Promise<string | null> {
  const supabase = createClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("pdf_signed_path, pdf_original_path")
    .eq("id", contractId)
    .single();
  const ruta = c?.pdf_signed_path ?? c?.pdf_original_path;
  if (!ruta) return null;
  const { data } = await supabase.storage.from("contracts").createSignedUrl(ruta, 60);
  return data?.signedUrl ?? null;
}

/**
 * Comprueba que el archivo guardado siga siendo el que se firmó.
 * Es el hallazgo que quedó abierto en Camino Sacro: la huella se guardaba y no la leía nadie.
 */
export async function verificarIntegridad(contractId: string) {
  const supabase = createClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("pdf_signed_path, pdf_signed_sha256, pdf_original_path, pdf_original_sha256")
    .eq("id", contractId)
    .single();
  if (!c) throw new Error("No encontré el contrato.");

  const ruta = c.pdf_signed_path ?? c.pdf_original_path;
  const esperado = c.pdf_signed_path ? c.pdf_signed_sha256 : c.pdf_original_sha256;
  if (!ruta || !esperado) return { ok: false as const, motivo: "Todavía no hay PDF guardado." };

  const { data: archivo, error } = await supabase.storage.from("contracts").download(ruta);
  if (error || !archivo) return { ok: false as const, motivo: `No pude leer el archivo: ${error?.message}` };

  const { sha256 } = await import("@/lib/contracts/firma");
  const real = sha256(Buffer.from(await archivo.arrayBuffer()));
  return real === esperado
    ? { ok: true as const, huella: real }
    : { ok: false as const, motivo: "La huella no coincide: el archivo cambió desde que se firmó.", huella: real };
}

/** Aviso a Naty cuando alguien firma. Va aparte del correo al peregrino, nunca encadenado. */
export async function avisarFirma(nombre: string, camino: string) {
  await avisoInterno(`Firmó ${nombre}`, `${nombre} acaba de firmar su contrato del ${camino}.`);
}

/**
 * Guarda la firma de Naty. Se estampa en todos los contratos que emita, así que se captura
 * una sola vez. Sin esto los contratos salen con su nombre en cursiva.
 */
export async function guardarFirmaOrganizador(trazoDataUrl: string) {
  const { trazoValido } = await import("@/lib/contracts/firma");
  const v = trazoValido(trazoDataUrl);
  if (!v.ok) throw new Error(v.error);

  const supabase = createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: "org_signature", value: { data_url: trazoDataUrl, updated_at: new Date().toISOString() } },
      { onConflict: "key" }
    );
  if (error) throw new Error(error.message);
  revalidatePath("/configuracion");
}
