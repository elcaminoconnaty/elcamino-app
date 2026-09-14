/**
 * Cómo se guarda el nombre de un peregrino: **nombre primero, apellido después**, en
 * "Nombre Apellido" y no en MAYÚSCULA.
 *
 * El pasaporte los trae al revés y en mayúscula sostenida ("Apellidos / Surname" arriba,
 * "Nombres / Given names" abajo), así que si se copia tal cual la lista queda mitad
 * "MORENO UBATE DEICY JOHANA" y mitad "Claudia Leal", y ordenada alfabéticamente esa
 * peregrina aparece en la M en vez de la D.
 */

/**
 * Partículas que van en minúscula cuando no abren el nombre: "Luz Helena del Socorro",
 * no "Luz Helena Del Socorro". Van también las de otros idiomas porque los apellidos
 * de familia no siempre son españoles.
 */
const PARTICULAS = new Set([
  "de", "del", "la", "las", "lo", "los", "y", "e", "da", "das", "do", "dos",
  "van", "von", "der", "den", "di", "du", "el", "al", "bin", "ibn",
]);

/** Une lo que venga sin dejar dobles espacios ni espacios en las puntas. */
const limpiar = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * "MARIA DEL SOCORRO DAVILA" → "Maria del Socorro Davila". Respeta guiones y apóstrofes
 * ("Ana-María", "D'Angelo") y deja en paz lo que ya venía escrito con mayúsculas y
 * minúsculas mezcladas, que es señal de que alguien lo escribió a mano.
 */
export function tituloDeNombre(raw: string | null | undefined): string {
  const texto = limpiar(raw ?? "");
  if (!texto) return "";
  // Si ya tiene minúsculas, no lo tocamos: "Beatriz del Carmen Ibáñez" ya está bien.
  if (texto !== texto.toUpperCase()) return texto;

  return texto
    .toLocaleLowerCase("es")
    .split(" ")
    .map((palabra, i) => {
      if (i > 0 && PARTICULAS.has(palabra)) return palabra;
      // Cada tramo entre guiones y apóstrofes lleva su propia mayúscula.
      return palabra.replace(/(^|[-'’])(\S)/g, (_, sep, letra) => sep + letra.toLocaleUpperCase("es"));
    })
    .join(" ");
}

/**
 * La primera línea de la MRZ (las dos líneas de abajo del pasaporte, las de los `<`):
 * dos caracteres de tipo, tres de país y después `APELLIDOS<<NOMBRES`, con `<` en vez de
 * espacios. Es la fuente más confiable del corte entre apellido y nombre… cuando la OCR
 * la leyó bien, así que devuelve `null` en cuanto algo no cuadra.
 */
export function nombreDesdeMrz(mrz: string | null | undefined): { nombres: string; apellidos: string } | null {
  if (!mrz) return null;
  const crudo = mrz.toUpperCase();
  // La MRZ puede venir con las dos líneas juntas; la del nombre es la que trae `<<`.
  const linea = crudo.split(/[\n\r]+/).find((l) => l.includes("<<")) ?? crudo;
  const cuerpo = linea.slice(5); // tipo (2) + país (3)
  const corte = cuerpo.indexOf("<<");
  if (corte < 0) return null;

  // Un nombre no tiene dígitos: en cuanto aparece uno, empezó el número de documento
  // de la segunda línea y hay que parar.
  const palabrasLimpias = (s: string) => {
    const out: string[] = [];
    for (const palabra of limpiar(s.replace(/</g, " ")).split(" ")) {
      if (!palabra) continue;
      if (/\d/.test(palabra)) break;
      out.push(palabra);
    }
    return out.join(" ");
  };

  const apellidos = palabrasLimpias(cuerpo.slice(0, corte));
  const nombres = palabrasLimpias(cuerpo.slice(corte + 2));
  if (!apellidos || !nombres) return null;
  return { nombres, apellidos };
}

/**
 * El nombre como lo queremos guardar, a partir de lo que se haya podido sacar del
 * pasaporte. En orden de confianza: los campos separados que leyó Claude (el pasaporte
 * los trae rotulados), después la MRZ, y por último el nombre suelto — que si viene con
 * coma ("MADRIZ DE MENDEZ, PATRICIA ELENA") también trae el corte adentro.
 */
export function armarNombreCompleto(datos: {
  given_names?: string | null;
  surnames?: string | null;
  full_name?: string | null;
  mrz?: string | null;
}): string {
  const nombres = limpiar(datos.given_names ?? "");
  const apellidos = limpiar(datos.surnames ?? "");
  if (nombres && apellidos) return tituloDeNombre(`${nombres} ${apellidos}`);

  const deMrz = nombreDesdeMrz(datos.mrz);
  if (deMrz) return tituloDeNombre(`${deMrz.nombres} ${deMrz.apellidos}`);

  const suelto = limpiar(datos.full_name ?? "");
  if (!suelto) return tituloDeNombre(nombres || apellidos);

  const coma = suelto.indexOf(",");
  if (coma > 0) {
    const izq = limpiar(suelto.slice(0, coma));
    const der = limpiar(suelto.slice(coma + 1));
    if (izq && der) return tituloDeNombre(`${der} ${izq}`);
  }
  return tituloDeNombre(suelto);
}

/** Orden alfabético en español, que es el que pone la Ñ donde va y no separa los acentos. */
export function compararNombres(a: string, b: string): number {
  return (a ?? "").localeCompare(b ?? "", "es", { sensitivity: "base" });
}
