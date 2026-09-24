import "server-only";
import { createClient } from "@/lib/supabase/server";
import { verificarPasaporte, type Aviso } from "@/lib/passport/verificar";
import { compararNombres } from "@/lib/passport/nombres";

/**
 * Lo que llenó cada peregrino en el formulario de registro, tal como lo baja el equipo
 * (Excel del camino y ficha PDF de cada uno). Todo sale de la tarjeta del peregrino: el
 * formulario escribe ahí, así que lo que se corrija a mano en la ficha también sale acá.
 */

export type FilaRegistro = {
  registrationId: string;
  pilgrimId: string;
  estado: string;
  nombre: string;
  apodo: string | null;
  sexo: string | null;
  correo: string | null;
  celular: string | null;
  nacimiento: string | null;
  edad: number | null;
  nacionalidad: string | null;
  pasaporte: string | null;
  pasaporteEmision: string | null;
  pasaporteVence: string | null;
  tieneArchivoPasaporte: boolean;
  pasaportePath: string | null;
  direccion: string | null;
  instagram: string | null;
  emergenciaNombre: string | null;
  emergenciaParentesco: string | null;
  emergenciaCelular: string | null;
  camiseta: string | null;
  sandalia: number | null;
  alimentacion: string | null;
  formularioLleno: string | null;
  formularioEnviado: string | null;
  bienvenidaEnviada: string | null;
  avisos: Aviso[];
};

export type RegistroDelCamino = {
  departureId: string;
  camino: string;
  inicio: string | null;
  fin: string | null;
  filas: FilaRegistro[];
};

function edad(nac: string | null, al: string | null): number | null {
  if (!nac) return null;
  const ref = al ? new Date(`${al}T12:00:00Z`) : new Date();
  const n = new Date(`${nac}T12:00:00Z`);
  let e = ref.getUTCFullYear() - n.getUTCFullYear();
  if (ref.getUTCMonth() < n.getUTCMonth() || (ref.getUTCMonth() === n.getUTCMonth() && ref.getUTCDate() < n.getUTCDate())) e--;
  return e >= 0 && e < 120 ? e : null;
}

const SELECT =
  "id, status, registration_form_submitted_at, form_sent_at, welcome_sent_at, departure_id, " +
  "pilgrims!inner(id, full_name, nickname, sex, email, phone, birth_date, nationality, passport_number, passport_issue_date, passport_expiry_date, " +
  "passport_image_path, passport_ocr, passport_mrz, address, instagram, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, " +
  "shirt_size, sandal_size, dietary_notes, deleted_at)";

function aFila(r: any, dep: { start_date: string | null; end_date: string | null }): FilaRegistro {
  const p = r.pilgrims;
  return {
    registrationId: r.id,
    pilgrimId: p.id,
    estado: r.status,
    nombre: p.full_name,
    apodo: p.nickname,
    sexo: p.sex,
    correo: p.email,
    celular: p.phone,
    nacimiento: p.birth_date,
    // La edad que tendrá al caminar, que es la que le importa al seguro.
    edad: edad(p.birth_date, dep.start_date),
    nacionalidad: p.nationality,
    pasaporte: p.passport_number,
    pasaporteEmision: p.passport_issue_date,
    pasaporteVence: p.passport_expiry_date,
    tieneArchivoPasaporte: !!p.passport_image_path,
    pasaportePath: p.passport_image_path,
    direccion: p.address,
    instagram: p.instagram,
    emergenciaNombre: p.emergency_contact_name,
    emergenciaParentesco: p.emergency_contact_relation,
    emergenciaCelular: p.emergency_contact_phone,
    camiseta: p.shirt_size,
    sandalia: p.sandal_size,
    alimentacion: p.dietary_notes,
    formularioLleno: r.registration_form_submitted_at,
    formularioEnviado: r.form_sent_at,
    bienvenidaEnviada: r.welcome_sent_at,
    avisos: verificarPasaporte({
      escrito: p,
      lectura: p.passport_ocr ?? { mrz: p.passport_mrz },
      tieneArchivo: !!p.passport_image_path,
      regreso: dep.end_date ?? dep.start_date,
    }),
  };
}

/** Todos los peregrinos activos del camino, en orden alfabético. */
export async function registroDelCamino(departureId: string, supabase: any = createClient()): Promise<RegistroDelCamino | null> {
  const { data: dep } = await supabase.from("departures").select("id, name, start_date, end_date").eq("id", departureId).maybeSingle();
  if (!dep) return null;
  const { data: regs } = await supabase.from("registrations").select(SELECT).eq("departure_id", departureId).neq("status", "cancelado");
  const filas = (regs ?? [])
    .filter((r: any) => r.pilgrims && !r.pilgrims.deleted_at)
    .map((r: any): FilaRegistro => aFila(r, dep))
    .sort((a: FilaRegistro, b: FilaRegistro) => compararNombres(a.nombre, b.nombre));
  return { departureId, camino: dep.name, inicio: dep.start_date, fin: dep.end_date, filas };
}

/** Un solo peregrino, para su ficha. */
export async function registroDeInscripcion(
  registrationId: string,
  supabase: any = createClient()
): Promise<{ camino: string; inicio: string | null; fin: string | null; fila: FilaRegistro } | null> {
  const { data: r } = await supabase
    .from("registrations")
    .select(`${SELECT}, departures:departure_id(name, start_date, end_date)`)
    .eq("id", registrationId)
    .maybeSingle();
  if (!r || !(r as any).pilgrims) return null;
  const dep = (r as any).departures;
  return { camino: dep.name, inicio: dep.start_date, fin: dep.end_date, fila: aFila(r, dep) };
}
