import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la llave de servicio. **Se salta RLS**, así que solo se usa donde hace falta
 * y nunca llega al navegador (`server-only` lo garantiza en tiempo de compilación).
 *
 * Hace falta exactamente en un sitio: el flujo público de firma. El peregrino no tiene
 * cuenta, así que llega sin sesión, y todas las políticas de la base son `to authenticated`.
 * Sin esto, la página de firma le diría "enlace no válido" a todo el mundo.
 *
 * Lo que autoriza al peregrino no es la base: es el token de 256 bits de su enlace, que se
 * comprueba antes de cada consulta. La llave de servicio solo permite que el servidor pueda
 * leer y escribir en su nombre una vez comprobado.
 *
 * **Regla: nunca usarlo en una consulta cuyo filtro no venga de un token ya validado.**
 * Ampliar el permiso a `anon` en las políticas sería peor — expondría todos los contratos a
 * cualquiera con la llave pública, que va en el HTML.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY. Sin ella el peregrino no puede abrir su enlace de firma. " +
        "Se copia de Supabase → Project Settings → API → service_role."
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next.js cachea los `fetch` del servidor por URL, y la consulta de una página pública
    // es siempre la misma URL: sin esto, el peregrino que vuelve a su enlace ve lo que
    // había ANTES de guardar (se vio en el formulario de inscripción: la lista seguía en
    // "por llenar" después de enviar). Estas páginas son dinámicas por definición.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
