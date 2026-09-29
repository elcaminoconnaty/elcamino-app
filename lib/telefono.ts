/**
 * Celulares: una sola regla para guardarlos y para armar el enlace de wa.me.
 *
 * Forma canónica al guardar (la que ya tiene la base, no se reescribe lo viejo):
 * - Celular colombiano: los 10 dígitos pelados ("3004912345"), con o sin +57 en la entrada.
 * - Cualquier otro con indicativo: "+<indicativo> <número>" ("+34 600123456").
 * - Lo que no se puede leer con seguridad se guarda como lo escribieron: mejor un dato
 *   raro que perder el número.
 */

/**
 * Indicativos que reconocemos para separar "+<cc> <número>". Se prueba el más largo
 * primero ("+351" es Portugal, no "+35"). Si no está en la lista, se guarda "+<dígitos>".
 */
const INDICATIVOS = [
  "1", "7", "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47",
  "48", "49", "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66",
  "81", "82", "84", "86", "90", "91", "351", "352", "353", "354", "356", "358", "372", "376", "385", "386",
  "420", "421", "501", "502", "503", "504", "505", "506", "507", "509", "591", "593", "595", "598", "971", "972",
];

function separarIndicativo(digitos: string): { cc: string; numero: string } | null {
  for (const largo of [3, 2, 1]) {
    const cc = digitos.slice(0, largo);
    if (INDICATIVOS.includes(cc) && digitos.length - largo >= 6) return { cc, numero: digitos.slice(largo) };
  }
  return null;
}

/** Celular colombiano: 10 dígitos que empiezan por 3. */
const esCelularColombiano = (d: string) => /^3\d{9}$/.test(d);
/** Móvil español sin "+": 34 + 9 dígitos que empiezan por 6 o 7. */
const esMovilEspanolSinMas = (d: string) => /^34[67]\d{8}$/.test(d);

/** La forma canónica para guardar en `pilgrims.phone`. Vacío → null. */
export function normalizarCelular(entrada: string | null | undefined): string | null {
  const crudo = String(entrada ?? "").trim();
  if (!crudo) return null;
  // Con letras ("ext 22", "casa") no se adivina: se guarda tal cual lo escribieron.
  if (/[a-z]/i.test(crudo)) return crudo;
  let digitos = crudo.replace(/\D/g, "");
  if (!digitos) return crudo;

  // "0034…" es la forma europea de escribir "+34…".
  let conIndicativo = crudo.startsWith("+");
  if (!conIndicativo && digitos.startsWith("00")) {
    conIndicativo = true;
    digitos = digitos.slice(2);
  }

  if (conIndicativo) {
    // "+300 123 4567": un celular colombiano con un "+" de más, no el indicativo 30 de Grecia.
    if (esCelularColombiano(digitos)) return digitos;
    if (digitos.startsWith("57") && esCelularColombiano(digitos.slice(2))) return digitos.slice(2);
    const partes = separarIndicativo(digitos);
    return partes ? `+${partes.cc} ${partes.numero}` : `+${digitos}`;
  }

  if (esCelularColombiano(digitos)) return digitos;
  if (/^573\d{9}$/.test(digitos)) return digitos.slice(2);
  if (esMovilEspanolSinMas(digitos)) return `+34 ${digitos.slice(2)}`;
  // Sin "+" y sin forma conocida (un fijo, un número de otro país sin indicativo): tal cual.
  return crudo;
}

/**
 * El número como lo quiere wa.me: solo dígitos y con indicativo. Hay peregrinos guardados
 * como "300 491 2345", sin +57, y wa.me lo leería como indicativo 300: un celular colombiano
 * (10 dígitos que empiezan por 3) sin "+" se completa con 57. Si no hay número usable, null
 * (mejor no mandar nada que mandárselo a un desconocido).
 */
export function numeroWhatsApp(telefono: string | null): string | null {
  // "…1234 ext 22": la extensión no va en el enlace de WhatsApp.
  const crudo = (telefono ?? "").trim().replace(/[a-z].*$/i, "").trim();
  const digitos = crudo.replace(/\D/g, "");
  if (!crudo.startsWith("+") && esCelularColombiano(digitos)) return `57${digitos}`;
  if (crudo.startsWith("+") && digitos.length >= 8) return digitos;
  if (/^573\d{9}$/.test(digitos)) return digitos;
  if (esMovilEspanolSinMas(digitos)) return digitos;
  if (digitos.startsWith("00") && digitos.length >= 10) return digitos.slice(2);
  return null;
}
