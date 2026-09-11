import "server-only";
// El peregrino no tiene cuenta: este módulo corre sin sesión y se autoriza con el token del
// camino (departures.registration_token). La inscripción elegida se cruza SIEMPRE con ese
// camino; el id viene del cliente y no se le cree nada más. Ver lib/supabase/admin.ts.
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { tokenPlausible } from "@/lib/menus/por-token";
import { extraerDatosPasaporte, camposDesdePasaporte, ocrDisponible } from "@/lib/passport/extraer";
import { TALLAS_CAMISETA, TALLAS_SANDALIA } from "@/lib/registro/textos";

export type PeregrinoDeLista = { registration_id: string; nombre: string; completo: boolean };
export type ListaRegistro = { camino: string; fechas: string | null; peregrinos: PeregrinoDeLista[] };

/** Lo que el formulario muestra de la persona antes de que escriba: solo lo no sensible. */
export type FichaParaFormulario = {
  estado: "activo" | "inactivo";
  nombre: string;
  camino: string;
  email: string | null;
  tienePasaporte: boolean;
  enviadoEl: string | null;
  ocr: boolean;
};

export type DatosFormulario = {
  full_name: string;
  email: string;
  phone: string;
  birth_date: string;
  passport_number: string;
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

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function caminoPorToken(supabase: any, token: string): Promise<{ id: string; name: string; start_date: string | null; end_date: string | null } | null> {
  if (!tokenPlausible(token)) return null;
  const { data } = await supabase.from("departures").select("id, name, start_date, end_date").eq("registration_token", token).maybeSingle();
  return data ?? null;
}

async function inscripcion(supabase: any, token: string, registrationId: string) {
  const camino = await caminoPorToken(supabase, token);
  if (!camino) return null;
  if (!/^[0-9a-f-]{36}$/i.test(registrationId ?? "")) return null;
  const { data: reg } = await supabase
    .from("registrations")
    .select("id, pilgrim_id, departure_id, status, registration_form_submitted_at, pilgrims:pilgrim_id(id, full_name, email, deleted_at, passport_image_path)")
    .eq("id", registrationId)
    .eq("departure_id", camino.id)
    .maybeSingle();
  if (!reg || !reg.pilgrims || reg.pilgrims.deleted_at) return null;
  return { reg, camino };
}

export async function listaPorToken(token: string): Promise<ListaRegistro | null> {
  const supabase = createAdminClient();
  const camino = await caminoPorToken(supabase, token);
  if (!camino) return null;
  const { data: regs } = await supabase
    .from("registrations")
    .select("id, registration_form_submitted_at, pilgrims!inner(full_name, deleted_at)")
    .eq("departure_id", camino.id)
    .neq("status", "cancelado");
  const peregrinos = (regs ?? [])
    .filter((r: any) => r.pilgrims && !r.pilgrims.deleted_at)
    .map((r: any) => ({ registration_id: r.id, nombre: r.pilgrims.full_name, completo: !!r.registration_form_submitted_at }))
    .sort((a: PeregrinoDeLista, b: PeregrinoDeLista) => a.nombre.localeCompare(b.nombre, "es"));
  return { camino: camino.name, fechas: camino.start_date ?? null, peregrinos };
}

export async function fichaPorToken(token: string, registrationId: string): Promise<FichaParaFormulario | null> {
  const supabase = createAdminClient();
  const r = await inscripcion(supabase, token, registrationId);
  if (!r) return null;
  return {
    estado: r.reg.status === "cancelado" ? "inactivo" : "activo",
    nombre: r.reg.pilgrims.full_name,
    camino: r.camino.name,
    email: r.reg.pilgrims.email ?? null,
    tienePasaporte: !!r.reg.pilgrims.passport_image_path,
    enviadoEl: r.reg.registration_form_submitted_at ?? null,
    ocr: ocrDisponible(),
  };
}

/** URL firmada para que el celular suba la foto directo al bucket (no pasa por el servidor). */
export async function urlSubidaPasaporte(token: string, registrationId: string, filename: string): Promise<Resultado<{ path: string; signedUrl: string; uploadToken: string }>> {
  const supabase = createAdminClient();
  const r = await inscripcion(supabase, token, registrationId);
  if (!r) return { ok: false, error: "Enlace no válido." };
  const ext = (filename.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${r.reg.pilgrim_id}/${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from("passports").createSignedUploadUrl(path);
  if (error) return { ok: false, error: "No se pudo preparar la subida. Vuelve a intentar." };
  return { ok: true, path, signedUrl: data.signedUrl, uploadToken: data.token };
}

/**
 * Guarda la foto en la ficha y, si hay OCR, lee el pasaporte y devuelve lo que sirve para
 * prellenar. Sin clave de Claude, solo guarda la foto y el formulario sigue a mano.
 */
export async function leerPasaporte(token: string, registrationId: string, path: string): Promise<Resultado<{ passport_number: string | null; birth_date: string | null; full_name: string | null }>> {
  const supabase = createAdminClient();
  const r = await inscripcion(supabase, token, registrationId);
  if (!r) return { ok: false, error: "Enlace no válido." };
  if (!path.startsWith(`${r.reg.pilgrim_id}/`)) return { ok: false, error: "Esa foto no es tuya." };
  if (!ocrDisponible()) {
    await supabase.from("pilgrims").update({ passport_image_path: path }).eq("id", r.reg.pilgrim_id);
    return { ok: true, passport_number: null, birth_date: null, full_name: null };
  }
  try {
    const data = await extraerDatosPasaporte(supabase, path);
    // Se guarda lo leído (como hace el equipo desde la ficha); el formulario deja corregirlo.
    const campos = camposDesdePasaporte(data, path);
    delete campos.full_name; // el nombre lo escribe la persona como quiere que aparezca
    await supabase.from("pilgrims").update(campos).eq("id", r.reg.pilgrim_id);
    return { ok: true, passport_number: data.passport_number, birth_date: data.birth_date, full_name: data.full_name };
  } catch {
    await supabase.from("pilgrims").update({ passport_image_path: path }).eq("id", r.reg.pilgrim_id);
    return { ok: true, passport_number: null, birth_date: null, full_name: null };
  }
}

function limpiar(s: unknown, max = 200): string {
  return String(s ?? "").trim().slice(0, max);
}

function validar(d: DatosFormulario): string | null {
  if (limpiar(d.full_name).length < 5) return "Escribe tu nombre completo.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpiar(d.email))) return "Revisa el correo.";
  if (limpiar(d.phone).replace(/\D/g, "").length < 8) return "Revisa tu celular.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.birth_date) || isNaN(new Date(d.birth_date).getTime())) return "Revisa la fecha de nacimiento.";
  const edad = (Date.now() - new Date(d.birth_date).getTime()) / (365.25 * 864e5);
  if (edad < 10 || edad > 100) return "Revisa la fecha de nacimiento.";
  if (limpiar(d.passport_number).length < 5) return "Escribe el número de pasaporte.";
  if (limpiar(d.address).length < 8) return "Escribe la dirección donde vives.";
  if (limpiar(d.emergency_contact_name).length < 3) return "Escribe el nombre de tu contacto.";
  if (limpiar(d.emergency_contact_relation).length < 2) return "Dinos el parentesco de tu contacto.";
  if (limpiar(d.emergency_contact_phone).replace(/\D/g, "").length < 8) return "Revisa el celular de tu contacto.";
  if (!(TALLAS_CAMISETA as readonly string[]).includes(d.shirt_size)) return "Elige tu talla de camiseta.";
  if (!(TALLAS_SANDALIA as readonly number[]).includes(Number(d.sandal_size))) return "Elige tu talla de sandalias.";
  if (limpiar(d.dietary_notes).length < 1) return "Cuéntanos si tienes alguna restricción de alimentos (o escribe \"ninguna\").";
  return null;
}

/** Guarda lo que llenó. Se puede volver a mandar: sobrescribe y guarda el envío crudo. */
export async function enviarFormulario(token: string, registrationId: string, d: DatosFormulario): Promise<Resultado> {
  const supabase = createAdminClient();
  const r = await inscripcion(supabase, token, registrationId);
  if (!r) return { ok: false, error: "Enlace no válido." };
  if (r.reg.status === "cancelado") return { ok: false, error: "Esta inscripción ya no está activa." };
  const problema = validar(d);
  if (problema) return { ok: false, error: problema };

  const ficha = {
    full_name: limpiar(d.full_name, 120),
    email: limpiar(d.email, 120).toLowerCase(),
    phone: limpiar(d.phone, 40),
    birth_date: d.birth_date,
    passport_number: limpiar(d.passport_number, 40).toUpperCase(),
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
  const { error } = await supabase.from("pilgrims").update(ficha).eq("id", r.reg.pilgrim_id);
  if (error) return { ok: false, error: "No se pudo guardar. Vuelve a intentar." };
  await supabase
    .from("registrations")
    .update({ registration_form_submitted_at: new Date().toISOString(), registration_form_raw: { ...ficha, enviado: new Date().toISOString() } })
    .eq("id", r.reg.id);
  revalidatePath(`/caminos/${r.reg.departure_id}`);
  revalidatePath(`/peregrinos/${r.reg.pilgrim_id}`);
  return { ok: true };
}

/** "No estoy en la lista": queda una solicitud para que el equipo la revise. */
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
