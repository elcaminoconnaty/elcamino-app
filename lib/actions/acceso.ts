"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { intentar, type Resultado } from "@/lib/resultado";

/**
 * Entrar con la cédula.
 *
 * Supabase Auth necesita un correo, así que cada cuenta del equipo tiene uno sintético
 * (`<cedula>@equipo.elcaminoconnaty.com`, dominio sin buzón) y la persona solo ve su cédula.
 * Buscar el perfil por cédula exige la llave de servicio porque quien está en /login todavía
 * no tiene sesión; por eso estas acciones nunca devuelven nada del perfil salvo el estado.
 *
 * Primera vez: si la cuenta no tiene contraseña propia (`password_set_at` nulo), la cédula
 * sola alcanza para crearla. Fue decisión de Nico (2026-10-15) a sabiendas de que la cédula
 * de Naty sale en los contratos. "Restablecer" en Configuración → Equipo vuelve a abrir ese
 * paso para una persona.
 */

const MIN_CLAVE = 8;

const normalizar = (cedula: string) => String(cedula ?? "").replace(/\D/g, "");

type Estado = "activa" | "nueva";

/** Lo que hace la llave de servicio, el trigger de la bitácora lo ve como "sistema". Estas
 *  dos acciones sí tienen autor, así que se anotan a mano con su nombre. */
async function anotar(autorId: string, perfilId: string, accion: string) {
  const admin = createAdminClient();
  const { data: autor } = await admin.from("profiles").select("full_name, email").eq("id", autorId).maybeSingle();
  await admin.from("audit_log").insert({
    user_id: autorId,
    user_name: autor?.full_name ?? autor?.email ?? null,
    actor: "equipo",
    table_name: "profiles",
    op: "update",
    row_id: perfilId,
    changed: ["contraseña"],
    new: { accion },
  });
}

async function perfilPorCedula(cedula: string) {
  const c = normalizar(cedula);
  if (!/^[0-9]{5,12}$/.test(c)) return null;
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, email, password_set_at, app_role")
    .eq("cedula", c)
    .maybeSingle();
  return data && data.app_role ? data : null;
}

/** Qué pantalla mostrar después de escribir la cédula. Una cédula que no existe responde
 *  "activa" a propósito: así el formulario no confirma quién tiene cuenta. */
export async function estadoCedula(cedula: string): Promise<Resultado<{ estado: Estado }>> {
  return intentar(async () => {
    const p = await perfilPorCedula(cedula);
    return { estado: (p && !p.password_set_at ? "nueva" : "activa") as Estado };
  });
}

export async function entrarConCedula(cedula: string, clave: string): Promise<Resultado> {
  return intentar(async () => {
    const p = await perfilPorCedula(cedula);
    if (!p?.email || !p.password_set_at) throw new Error("Cédula o contraseña incorrecta.");
    const { error } = await createClient().auth.signInWithPassword({ email: p.email, password: clave });
    if (error) throw new Error("Cédula o contraseña incorrecta.");
  });
}

export async function crearClaveInicial(cedula: string, clave: string): Promise<Resultado> {
  return intentar(async () => {
    if (clave.length < MIN_CLAVE) throw new Error(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres.`);
    const p = await perfilPorCedula(cedula);
    if (!p?.email) throw new Error("No encontré una cuenta con esa cédula.");
    if (p.password_set_at) throw new Error("Esta cuenta ya tiene contraseña. Entrá con ella.");

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(p.id, { password: clave });
    if (error) throw new Error(`No pude guardar la contraseña: ${error.message}`);
    // Solo se marca si sigue pendiente: si dos pestañas lo intentan a la vez, gana una.
    const { data: marcada } = await admin
      .from("profiles")
      .update({ password_set_at: new Date().toISOString() })
      .eq("id", p.id)
      .is("password_set_at", null)
      .select("id");
    if (!marcada?.length) throw new Error("Esta cuenta ya tiene contraseña. Entrá con ella.");
    await anotar(p.id, p.id, "creó su contraseña");

    const { error: errEntrar } = await createClient().auth.signInWithPassword({ email: p.email, password: clave });
    if (errEntrar) throw new Error("Guardé la contraseña pero no pude entrar. Probá de nuevo con ella.");
  });
}

/** Configuración → Equipo. Le quita la contraseña a una cuenta: la próxima vez que esa
 *  persona entre con su cédula, crea una nueva. */
export async function restablecerClave(perfilId: string): Promise<Resultado> {
  return intentar(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: esEquipo } = await supabase.rpc("is_team_member");
    if (!user || !esEquipo) throw new Error("No autorizado.");

    const admin = createAdminClient();
    const { data: p } = await admin.from("profiles").select("id, cedula").eq("id", perfilId).maybeSingle();
    if (!p?.cedula) throw new Error("Esa cuenta no entra con cédula.");

    const { error } = await admin.auth.admin.updateUserById(p.id, {
      password: randomBytes(32).toString("base64url"),
    });
    if (error) throw new Error(`No pude restablecerla: ${error.message}`);
    await admin.from("profiles").update({ password_set_at: null }).eq("id", p.id);
    await anotar(user.id, p.id, "restableció la contraseña");
    revalidatePath("/configuracion");
  });
}

export async function cambiarMiClave(clave: string): Promise<Resultado> {
  return intentar(async () => {
    if (clave.length < MIN_CLAVE) throw new Error(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres.`);
    const { error } = await createClient().auth.updateUser({ password: clave });
    if (error) throw new Error(`No pude cambiarla: ${error.message}`);
  });
}
