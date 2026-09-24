/**
 * `revalidatePath` solo funciona dentro de una petición de Next. Los guiones de prueba que
 * llaman acciones de servidor (p. ej. enviar el formulario de registro) lo mapean acá.
 */
export function revalidatePath(_path: string) {}
export function revalidateTag(_tag: string) {}
