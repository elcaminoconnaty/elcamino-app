import { isRedirectError } from "next/dist/client/components/redirect";
import { isNotFoundError } from "next/dist/client/components/not-found";

/**
 * Lo que devuelve una acción del servidor que el usuario dispara desde un formulario.
 *
 * Por qué no `throw`: en producción Next 14 borra el mensaje de un error lanzado en una
 * server action y el cliente recibe "An error occurred in the Server Components render…".
 * El "El peregrino ya está inscrito en ese camino." solo se veía en `npm run dev`. Un
 * objeto devuelto sí llega entero.
 */
export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Servidor: corre el cuerpo de la acción y convierte cualquier `throw` en
 * `{ ok: false, error }`. Si el cuerpo devuelve un objeto, sus campos van junto a `ok`.
 * `redirect()` y `notFound()` también lanzan, pero son navegación: esos se dejan pasar.
 */
export async function intentar<T extends object | void>(
  fn: () => Promise<T>
): Promise<Resultado<T extends object ? T : object>> {
  try {
    const r = await fn();
    return { ok: true, ...((r ?? {}) as object) } as Resultado<T extends object ? T : object>;
  } catch (e: unknown) {
    if (isRedirectError(e) || isNotFoundError(e)) throw e;
    const error = e instanceof Error && e.message ? e.message : "No se pudo guardar. Intenta de nuevo.";
    return { ok: false, error };
  }
}

/**
 * Cliente: si la acción falló, lanza **acá** (en el navegador) con el mensaje real, para
 * que el `catch` que ya muestra el toast lo reciba completo. Si salió bien, devuelve el
 * resultado sin el `ok`.
 */
export function exigir<T extends object>(r: Resultado<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r as T;
}
