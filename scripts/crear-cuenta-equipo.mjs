// Crea (o actualiza) la cuenta de una persona del equipo, que entra con su cédula.
//
//   node --env-file=.env.local scripts/crear-cuenta-equipo.mjs <cedula> "<Nombre>" <rol>
//
// rol: naty | nico | admin. La cuenta nace SIN contraseña conocida (una aleatoria que nadie
// ve) y con `password_set_at` nulo: la primera vez que la persona entra con su cédula, la
// plataforma le pide que cree la suya. Correrlo de nuevo con la misma cédula no toca la
// contraseña; solo corrige nombre y rol.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const [cedulaArg, nombre, rol] = process.argv.slice(2);
const cedula = String(cedulaArg ?? "").replace(/\D/g, "");
if (!/^[0-9]{5,12}$/.test(cedula) || !nombre || !["naty", "nico", "admin"].includes(rol)) {
  console.error('Uso: node --env-file=.env.local scripts/crear-cuenta-equipo.mjs <cedula> "<Nombre>" <naty|nico|admin>');
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `${cedula}@equipo.elcaminoconnaty.com`;

const { data: existente } = await admin.from("profiles").select("id").eq("cedula", cedula).maybeSingle();
let id = existente?.id;

if (!id) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: nombre },
  });
  if (error) throw new Error(`No pude crear el usuario: ${error.message}`);
  id = data.user.id;
  console.log(`Usuario creado: ${email}`);
} else {
  console.log(`Ya existía: ${email}`);
}

const { error: errPerfil } = await admin
  .from("profiles")
  .upsert({ id, email, full_name: nombre, app_role: rol, cedula }, { onConflict: "id" });
if (errPerfil) throw new Error(`No pude guardar el perfil: ${errPerfil.message}`);

const { data: perfil } = await admin
  .from("profiles")
  .select("full_name, app_role, cedula, password_set_at")
  .eq("id", id)
  .single();
console.log(perfil.password_set_at ? "Ya tiene contraseña propia." : "Pendiente: crea su contraseña al entrar con la cédula.", perfil);
