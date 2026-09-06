/**
 * `server-only` no es un paquete instalado: Next lo resuelve con un alias del empaquetador,
 * y su único trabajo es reventar la compilación si un módulo de servidor se cuela en el
 * navegador. Fuera de Next no existe, así que los guiones de prueba lo mapean acá.
 *
 * Es un archivo vacío a propósito. Que exista no relaja nada: la protección real la sigue
 * aplicando Next al compilar la app.
 */
export {};
