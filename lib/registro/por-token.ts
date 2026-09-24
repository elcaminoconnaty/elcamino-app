import "server-only";
// El peregrino no tiene cuenta: este módulo corre sin sesión y se autoriza por token.
// Hay dos enlaces y los dos llegan a `/registro/<token>`:
//
//  · El PERSONAL (`registrations.form_token`), el que sale de la tarjeta del peregrino. Abre
//    directo su formulario, con lo que ya sabemos de él. No muestra a nadie más.
//  · El DEL CAMINO (`departures.registration_token`), para un grupo de WhatsApp. Ya no lista
//    los nombres del grupo: la persona escribe el suyo y, si coincide con una sola
//    inscripción, entra. Ese formulario va vacío, porque cualquiera del grupo podría escribir
//    el nombre de otro.
//
// La inscripción se cruza SIEMPRE con el token; el id que manda el navegador no se cree.
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { tokenPlausible } from "@/lib/menus/por-token";
import { extraerDatosPasaporte, camposDesdePasaporte, ocrDisponible } from "@/lib/passport/extraer";
import { revisarMrz, type Aviso } from "@/lib/passport/verificar";
import { TALLAS_CAMISETA, TALLAS_SANDALIA } from "@/lib/registro/textos";

/** Lo que el formulario sabe de la persona antes de que escriba. */
export type FichaParaFormulario = {
  estado: "activo" | "inactivo";
  nombre: string;
  /** Cómo saludarla: el apodo si lo dio, si no el primer nombre. */
  saludo: string;
  sexo: "F" | "M" | null;
  camino: string;
  /** Último día del camino (o el primero si no hay último): contra esto se mide la vigencia. */
  regreso: string | null;
  email: string | null;
  tienePasaporte: boolean;
  enviadoEl: string | null;
  ocr: boolean;
  /** Solo con el enlace personal: sus propios datos, para que corrija en vez de reescribir. */
  prellenado: Partial<DatosFormulario> | null;
  /** Lo que leímos del pasaporte (solo con el enlace personal), para comparar al enviar. */
  lecturaPasaporte: string | null;
  /** Enlace a su carta de bienvenida (solo con el enlace personal). */
  cartaUrl: string | null;
  /** Por el enlace del grupo, por qué no puede llenar (ya lo llenó o ya tiene su enlace). */
  bloqueado: string | null;
};

export type DatosFormulario = {
  full_name: string;
  email: string;
  phone: string;
  birth_date: string;
  passport_number: string;
  passport_expiry_date: string;
  nickname?: string | null;
  address: string;
  instagram?: string | null;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_phone: string;
  shirt_size: string;
  sandal_size: number;
  dietary_notes: string;
};

export type Enlace =
  | { tipo: "personal"; registrationId: string; ficha: FichaParaFormulario }
  | { tipo: "grupo"; camino: string };

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SELECT_REG =
  "id, pilgrim_id, departure_id, status, form_token, registration_form_submitted_at, " +
  "departures:departure_id(id, name, start_date, end_date), " +
  "pilgrims:pilgrim_id(id, full_name, nickname, sex, email, phone, birth_date, passport_number, passport_expiry_date, address, instagram, " +
  "emergency_contact_name, emergency_contact_relation, emergency_contact_phone, shirt_size, sandal_size, dietary_notes, deleted_at, passport_image_path, passport_ocr)";

type Acceso = { reg: any; camino: { id: string; name: string; start_date: string | null; end_date: string | null }; personal: boolean };

async function caminoPorToken(supabase: any, token: string) {
  if (!tokenPlausible(token)) return null;
  const { data } = await supabase.from("departures").select("id, name, start_date, end_date").eq("registration_token", token).maybeSingle();
  return data ?? null;
}

/**
 * Quién es el que llega con este token. Con el enlace personal la inscripción sale del
 * token mismo; con el del camino hace falta el id, y se exige que sea de ese camino.
 */
async function acceso(supabase: any, token: string, registrationId?: string | null): Promise<Acceso | null> {
  if (!tokenPlausible(token)) return null;
  const { data: propia } = await supabase.from("registrations").select(SELECT_REG).eq("form_token", token).maybeSingle();
  if (propia) {
    if (registrationId && registrationId !== propia.id) return null;
    if (!propia.pilgrims || propia.pilgrims.deleted_at) return null;
    return { reg: propia, camino: propia.departures, personal: true };
  }
  const camino = await caminoPorToken(supabase, token);
  if (!camino || !/^[0-9a-f-]{36}$/i.test(registrationId ?? "")) return null;
  const { data: reg } = await supabase.from("registrations").select(SELECT_REG).eq("id", registrationId).eq("departure_id", camino.id).maybeSingle();
  if (!reg || !reg.pilgrims || reg.pilgrims.deleted_at) return null;
  return { reg, camino, personal: false };
}

/** "María José Pérez" → ["maria", "jose", "perez"]: sin tildes, sin mayúsculas. */
export function palabrasDeNombre(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-zñ\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 2 && !["de", "del", "la", "las", "los", "y"].includes(p));
}

function saludoDe(p: any): string {
  return (p.nickname ?? "").trim() || String(p.full_name ?? "").trim().split(/\s+/)[0] || "";
}

function armarFicha(a: Acceso): FichaParaFormulario {
  const p = a.reg.pilgrims;
  const ocr = (p.passport_ocr ?? null) as { passport_number?: string | null } | null;
  return {
    estado: a.reg.status === "cancelado" ? "inactivo" : "activo",
    nombre: p.full_name,
    saludo: saludoDe(p),
    sexo: p.sex === "F" || p.sex === "M" ? p.sex : null,
    camino: a.camino.name,
    regreso: a.camino.end_date ?? a.camino.start_date ?? null,
    // Por el enlace del grupo cualquiera puede escribir el nombre de otro: ahí no se
    // muestra nada de la persona, ni su correo, ni si ya subió el pasaporte.
    email: a.personal ? p.email ?? null : null,
    tienePasaporte: a.personal && !!p.passport_image_path,
    enviadoEl: a.personal ? a.reg.registration_form_submitted_at ?? null : null,
    ocr: ocrDisponible(),
    prellenado: a.personal
      ? {
          full_name: p.full_name ?? "",
          email: p.email ?? "",
          phone: p.phone ?? "",
          birth_date: p.birth_date ?? "",
          passport_number: p.passport_number ?? "",
          passport_expiry_date: p.passport_expiry_date ?? "",
          nickname: p.nickname ?? "",
          address: p.address ?? "",
          instagram: p.instagram ?? "",
          emergency_contact_name: p.emergency_contact_name ?? "",
          emergency_contact_relation: p.emergency_contact_relation ?? "",
          emergency_contact_phone: p.emergency_contact_phone ?? "",
          shirt_size: p.shirt_size ?? "",
          sandal_size: p.sandal_size ?? undefined,
          dietary_notes: p.dietary_notes ?? "",
        }
      : null,
    lecturaPasaporte: a.personal ? ocr?.passport_number ?? null : null,
    cartaUrl: a.personal ? `/api/pdf/bienvenida/publico/${a.reg.form_token}` : null,
    bloqueado: bloqueadoPorGrupo(a),
  };
}

/** Qué hay detrás de un token: el formulario de una persona o el buscador del camino. */
export async function resolverEnlace(token: string): Promise<Enlace | null> {
  const supabase = createAdminClient();
  if (!tokenPlausible(token)) return null;
  const a = await acceso(supabase, token);
  if (a) return { tipo: "personal", registrationId: a.reg.id, ficha: armarFicha(a) };
  const camino = await caminoPorToken(supabase, token);
  return camino ? { tipo: "grupo", camino: camino.name } : null;
}

/**
 * Por el enlace del grupo solo se llena lo que nadie ha llenado: si la persona ya mandó sus
 * datos o ya tiene su enlace personal, el del grupo no le puede pisar nada (cualquiera del
 * grupo podría escribir su nombre).
 */
function bloqueadoPorGrupo(a: Acceso): string | null {
  if (a.personal) return null;
  if (a.reg.registration_form_submitted_at || a.reg.form_token) {
    return "Tus datos ya los tenemos o ya te mandamos tu enlace personal por WhatsApp. Entra por ese enlace para corregir algo, o escríbenos.";
  }
  return null;
}

/** El formulario de una persona que entró por el enlace del camino (`?yo=`). */
export async function fichaPorToken(token: string, registrationId: string): Promise<FichaParaFormulario | null> {
  const a = await acceso(createAdminClient(), token, registrationId);
  return a ? armarFicha(a) : null;
}

/**
 * El buscador del enlace del camino. Pide al menos nombre y apellido y entra solo si
 * coincide con UNA inscripción: así nadie ve la lista del grupo.
 */
export async function buscarPorNombre(
  token: string,
  nombre: string
): Promise<{ ok: true; registrationId: string } | { ok: false; motivo: "corto" | "ninguno" | "varios" | "enlace" | "personal" }> {
  const supabase = createAdminClient();
  const camino = await caminoPorToken(supabase, token);
  if (!camino) return { ok: false, motivo: "enlace" };
  const buscadas = palabrasDeNombre(String(nombre ?? "").slice(0, 120));
  if (buscadas.length < 2) return { ok: false, motivo: "corto" };
  const { data: regs } = await supabase
    .from("registrations")
    .select("id, form_token, registration_form_submitted_at, pilgrims!inner(full_name, nickname, deleted_at)")
    .eq("departure_id", camino.id)
    .neq("status", "cancelado");
  const hits = (regs ?? []).filter((r: any) => {
    if (!r.pilgrims || r.pilgrims.deleted_at) return false;
    const guardado = palabrasDeNombre(r.pilgrims.full_name ?? "");
    const suyas = new Set([...guardado, ...palabrasDeNombre(r.pilgrims.nickname ?? "")]);
    // En los dos sentidos: escribió parte de su nombre ("Laura Lizcano"), o lo escribió
    // completo como en el pasaporte y acá está guardado más corto ("Laura Andrea Lizcano Jiménez").
    const escritas = new Set(buscadas);
    return buscadas.every((b) => suyas.has(b)) || (guardado.length >= 2 && guardado.every((g) => escritas.has(g)));
  });
  if (hits.length === 1) {
    if (hits[0].registration_form_submitted_at || hits[0].form_token) return { ok: false, motivo: "personal" };
    return { ok: true, registrationId: hits[0].id };
  }
  return { ok: false, motivo: hits.length ? "varios" : "ninguno" };
}

/** URL firmada para que el celular suba el pasaporte directo al bucket (no pasa por el servidor). */
export async function urlSubidaPasaporte(token: string, registrationId: string, filename: string): Promise<Resultado<{ path: string; signedUrl: string; uploadToken: string }>> {
  const supabase = createAdminClient();
  const a = await acceso(supabase, token, registrationId);
  if (!a) return { ok: false, error: "Enlace no válido." };
  if (a.reg.status === "cancelado") return { ok: false, error: "Esta inscripción ya no está activa." };
  const bloqueo = bloqueadoPorGrupo(a);
  if (bloqueo) return { ok: false, error: bloqueo };
  const ext = (filename.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${a.reg.pilgrim_id}/${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from("passports").createSignedUploadUrl(path);
  if (error) return { ok: false, error: "No se pudo preparar la subida. Vuelve a intentar." };
  return { ok: true, path, signedUrl: data.signedUrl, uploadToken: data.token };
}

export type LecturaParaFormulario = {
  passport_number: string | null;
  birth_date: string | null;
  passport_expiry_date: string | null;
  full_name: string | null;
  /** Lo que la persona tiene que saber ya (p. ej. que el pasaporte se le vence). */
  avisos: Aviso[];
};

/**
 * Guarda el archivo en la ficha y, si hay OCR, lee el pasaporte y devuelve lo que sirve para
 * prellenar. Sin clave de Claude, solo guarda el archivo y el formulario sigue a mano.
 */
export async function leerPasaporte(token: string, registrationId: string, path: string): Promise<Resultado<LecturaParaFormulario>> {
  const supabase = createAdminClient();
  const a = await acceso(supabase, token, registrationId);
  if (!a) return { ok: false, error: "Enlace no válido." };
  if (a.reg.status === "cancelado") return { ok: false, error: "Esta inscripción ya no está activa." };
  const bloqueo = bloqueadoPorGrupo(a);
  if (bloqueo) return { ok: false, error: bloqueo };
  if (!path.startsWith(`${a.reg.pilgrim_id}/`)) return { ok: false, error: "Ese archivo no es tuyo." };
  const vacio = { passport_number: null, birth_date: null, passport_expiry_date: null, full_name: null, avisos: [] };
  if (!ocrDisponible()) {
    await supabase.from("pilgrims").update({ passport_image_path: path }).eq("id", a.reg.pilgrim_id);
    return { ok: true, ...vacio };
  }
  try {
    const data = await extraerDatosPasaporte(supabase, path);
    // Se guarda lo leído (como hace el equipo desde la ficha); el formulario deja corregirlo.
    const campos = camposDesdePasaporte(data, path);
    delete campos.full_name; // el nombre lo escribe la persona como quiere que aparezca
    await supabase.from("pilgrims").update(campos).eq("id", a.reg.pilgrim_id);
    // Si la MRZ cuadra con sus tres dígitos de control, manda sobre la zona impresa: es lo
    // que se le prellena y contra lo que se compara lo que escriba. La vigencia la avisa el
    // formulario mismo con la fecha de vencimiento prellenada.
    const mrz = revisarMrz(data.mrz);
    const confiable = mrz && mrz.numeroValido && mrz.nacimientoValido && mrz.vencimientoValido ? mrz : null;
    return {
      ok: true,
      passport_number: confiable?.numero ?? data.passport_number,
      birth_date: confiable?.nacimiento ?? data.birth_date,
      passport_expiry_date: confiable?.vencimiento ?? data.passport_expiry_date,
      full_name: data.full_name,
      avisos: [],
    };
  } catch {
    await supabase.from("pilgrims").update({ passport_image_path: path }).eq("id", a.reg.pilgrim_id);
    return { ok: true, ...vacio };
  }
}

function limpiar(s: unknown, max = 200): string {
  return String(s ?? "").trim().slice(0, max);
}

/** "2026-02-31" no es fecha: JS la corre al 3 de marzo, así que se compara de vuelta. */
const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

function validar(d: DatosFormulario): string | null {
  if (limpiar(d.full_name).length < 5) return "Escribe tu nombre completo.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpiar(d.email))) return "Revisa el correo.";
  if (limpiar(d.phone).replace(/\D/g, "").length < 8) return "Revisa tu celular.";
  if (!esFecha(d.birth_date)) return "Revisa la fecha de nacimiento.";
  const edad = (Date.now() - new Date(d.birth_date).getTime()) / (365.25 * 864e5);
  if (edad < 10 || edad > 100) return "Revisa la fecha de nacimiento.";
  if (limpiar(d.passport_number).replace(/[^A-Za-z0-9]/g, "").length < 5) return "Escribe el número de pasaporte.";
  if (!esFecha(d.passport_expiry_date)) return "Escribe la fecha de vencimiento del pasaporte.";
  if (limpiar(d.address).length < 8) return "Escribe la dirección donde vives.";
  if (limpiar(d.emergency_contact_name).length < 3) return "Escribe el nombre de tu contacto.";
  if (limpiar(d.emergency_contact_relation).length < 2) return "Dinos el parentesco de tu contacto.";
  if (limpiar(d.emergency_contact_phone).replace(/\D/g, "").length < 8) return "Revisa el celular de tu contacto.";
  if (!(TALLAS_CAMISETA as readonly string[]).includes(d.shirt_size)) return "Elige tu talla de camiseta.";
  if (!(TALLAS_SANDALIA as readonly number[]).includes(Number(d.sandal_size))) return "Elige tu talla de sandalias.";
  if (limpiar(d.dietary_notes).length < 1) return "Cuéntanos si tienes alguna restricción de alimentos (o escribe \"ninguna\").";
  return null;
}

/** Guarda lo que llenó en su tarjeta. Se puede volver a mandar: sobrescribe y guarda el envío crudo. */
export async function enviarFormulario(token: string, registrationId: string, d: DatosFormulario): Promise<Resultado> {
  const supabase = createAdminClient();
  const a = await acceso(supabase, token, registrationId);
  if (!a) return { ok: false, error: "Enlace no válido." };
  if (a.reg.status === "cancelado") return { ok: false, error: "Esta inscripción ya no está activa." };
  const bloqueo = bloqueadoPorGrupo(a);
  if (bloqueo) return { ok: false, error: bloqueo };
  const problema = validar(d);
  if (problema) return { ok: false, error: problema };

  const ficha = {
    full_name: limpiar(d.full_name, 120),
    email: limpiar(d.email, 120).toLowerCase(),
    phone: limpiar(d.phone, 40),
    birth_date: d.birth_date,
    passport_number: limpiar(d.passport_number, 40).toUpperCase().replace(/[^A-Z0-9]/g, ""),
    passport_expiry_date: d.passport_expiry_date,
    nickname: limpiar(d.nickname, 60) || null,
    address: limpiar(d.address, 240),
    instagram: limpiar(d.instagram, 60).replace(/^@/, "") || null,
    emergency_contact_name: limpiar(d.emergency_contact_name, 120),
    emergency_contact_relation: limpiar(d.emergency_contact_relation, 60),
    emergency_contact_phone: limpiar(d.emergency_contact_phone, 40),
    shirt_size: d.shirt_size,
    sandal_size: Number(d.sandal_size),
    dietary_notes: limpiar(d.dietary_notes, 500),
  };
  const { error } = await supabase.from("pilgrims").update(ficha).eq("id", a.reg.pilgrim_id);
  if (error) return { ok: false, error: "No se pudo guardar. Vuelve a intentar." };
  const ahora = new Date().toISOString();
  await supabase
    .from("registrations")
    .update({ registration_form_submitted_at: ahora, registration_form_raw: { ...ficha, enviado: ahora, por: a.personal ? "enlace personal" : "enlace del camino" } })
    .eq("id", a.reg.id);
  revalidatePath(`/caminos/${a.reg.departure_id}`);
  revalidatePath(`/peregrinos/${a.reg.pilgrim_id}`);
  return { ok: true };
}

/** "No me encuentro": queda una solicitud para que el equipo la revise. */
export async function solicitarInscripcion(token: string, d: { full_name: string; email: string; phone: string; mensaje?: string | null }): Promise<Resultado> {
  const supabase = createAdminClient();
  const camino = await caminoPorToken(supabase, token);
  if (!camino) return { ok: false, error: "Enlace no válido." };
  const full_name = limpiar(d.full_name, 120);
  if (full_name.length < 5) return { ok: false, error: "Escribe tu nombre completo." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpiar(d.email))) return { ok: false, error: "Revisa el correo." };
  const { error } = await supabase.from("registration_requests").insert({
    departure_id: camino.id,
    full_name,
    email: limpiar(d.email, 120).toLowerCase(),
    phone: limpiar(d.phone, 40) || null,
    payload: { mensaje: limpiar(d.mensaje, 500) || null },
  });
  if (error) return { ok: false, error: "No se pudo enviar. Vuelve a intentar." };
  revalidatePath(`/caminos/${camino.id}`);
  return { ok: true };
}
