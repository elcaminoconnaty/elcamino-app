/**
 * ¿Está bien el pasaporte que nos dieron? Tres pruebas, de la más fuerte a la más blanda:
 *
 * 1. **Dígitos de control de la MRZ.** Las dos líneas de abajo del pasaporte (las de los
 *    `<`) traen un dígito de control para el número, la fecha de nacimiento y el
 *    vencimiento (norma OACI 9303). Si la lectura sacó la MRZ y el dígito cuadra, el número
 *    es ese y no otro: no depende de que la OCR haya acertado en la zona impresa.
 * 2. **Lo que escribió la persona contra lo que leímos.** Un número tipeado con un cero
 *    de menos es el error más común del Google Form de antes.
 * 3. **Vigencia.** La carta de bienvenida lo dice: no se puede viajar con menos de seis
 *    meses de vigencia. Se cuenta desde el regreso del camino.
 *
 * Es código puro (sin servidor) porque lo usan el formulario del peregrino, la ficha del
 * equipo, el Excel y el PDF, y todos tienen que decir lo mismo.
 */

export type Lectura = {
  passport_number?: string | null;
  birth_date?: string | null;
  passport_expiry_date?: string | null;
  full_name?: string | null;
  mrz?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  leido_el?: string | null;
};

export type Aviso = { nivel: "error" | "alerta" | "ok"; texto: string };

/** Mayúscula, sin espacios, guiones ni puntos: "ax 123-456" → "AX123456". */
export function normalizarNumero(n: string | null | undefined): string {
  return String(n ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const PESOS = [7, 3, 1];

/** El dígito de control de la OACI 9303 para un tramo de la MRZ. */
export function digitoDeControl(tramo: string): number {
  let suma = 0;
  for (let i = 0; i < tramo.length; i++) {
    const c = tramo[i];
    const v = c === "<" ? 0 : /[0-9]/.test(c) ? Number(c) : /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : 0;
    suma += v * PESOS[i % 3];
  }
  return suma % 10;
}

/** La segunda línea de la MRZ de un pasaporte (TD3, 44 caracteres), si se puede aislar. */
function segundaLinea(mrz: string | null | undefined): string | null {
  if (!mrz) return null;
  const crudo = mrz.toUpperCase().replace(/[ \t]/g, "");
  const lineas = crudo.split(/[\r\n]+/).filter(Boolean);
  if (lineas.length >= 2) return lineas[lineas.length - 1];
  // A veces llega todo junto: 88 caracteres, la segunda mitad es la línea de datos.
  if (crudo.length >= 88) return crudo.slice(44, 88);
  return null;
}

/** "900131" (AAMMDD) → "1990-01-31". El siglo se deduce: los nacimientos no son futuros. */
function fechaMrz(aammdd: string, tipo: "nacimiento" | "vencimiento"): string | null {
  if (!/^\d{6}$/.test(aammdd)) return null;
  const aa = Number(aammdd.slice(0, 2));
  const siglo = tipo === "vencimiento" ? 2000 : aa > (new Date().getFullYear() % 100) ? 1900 : 2000;
  return `${siglo + aa}-${aammdd.slice(2, 4)}-${aammdd.slice(4, 6)}`;
}

export type MrzRevisada = {
  numero: string | null;
  numeroValido: boolean;
  nacimiento: string | null;
  nacimientoValido: boolean;
  vencimiento: string | null;
  vencimientoValido: boolean;
};

/** Lee el número y las fechas de la MRZ y dice si sus dígitos de control cuadran. */
export function revisarMrz(mrz: string | null | undefined): MrzRevisada | null {
  const l = segundaLinea(mrz);
  if (!l || l.length !== 44) return null;
  const numTramo = l.slice(0, 9);
  const nacTramo = l.slice(13, 19);
  const venTramo = l.slice(21, 27);
  const ok = (tramo: string, d: string) => /\d/.test(d) && digitoDeControl(tramo) === Number(d);
  return {
    numero: numTramo.replace(/</g, "") || null,
    numeroValido: ok(numTramo, l[9]),
    nacimiento: fechaMrz(nacTramo, "nacimiento"),
    nacimientoValido: ok(nacTramo, l[19]),
    vencimiento: fechaMrz(venTramo, "vencimiento"),
    vencimientoValido: ok(venTramo, l[27]),
  };
}

/** Suma meses a una fecha ISO sin líos de zona horaria. */
function masMeses(iso: string, meses: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/**
 * Todo lo que hay que mirar de un pasaporte, en frases listas para mostrar.
 * `regreso` es el último día del camino (o el primero, si no hay último).
 */
export function verificarPasaporte(args: {
  escrito: { passport_number?: string | null; birth_date?: string | null; passport_expiry_date?: string | null };
  lectura: Lectura | null | undefined;
  tieneArchivo: boolean;
  regreso: string | null;
}): Aviso[] {
  const { escrito, lectura, tieneArchivo, regreso } = args;
  const avisos: Aviso[] = [];
  // La OCR transcribe mal la MRZ a menudo (le sobra o le falta un carácter y todo se
  // corre). Un dígito suelto puede cuadrar por azar —uno de cada diez—, así que la MRZ solo
  // cuenta como prueba si cuadran los tres a la vez; si no, se ignora sin hacer ruido.
  const revisada = revisarMrz(lectura?.mrz);
  const mrz = revisada && revisada.numeroValido && revisada.nacimientoValido && revisada.vencimientoValido ? revisada : null;

  if (!tieneArchivo) avisos.push({ nivel: "alerta", texto: "No ha subido la foto del pasaporte." });

  const tecleado = normalizarNumero(escrito.passport_number);
  // Lo más confiable que tenemos: la MRZ si cuadra, si no la zona impresa leída.
  const confiable = mrz?.numeroValido ? normalizarNumero(mrz.numero) : normalizarNumero(lectura?.passport_number);
  const origen = mrz?.numeroValido ? "la MRZ del pasaporte (dígito de control correcto)" : "la foto del pasaporte";

  if (!tecleado) {
    avisos.push({ nivel: "alerta", texto: "Falta el número de pasaporte." });
  } else if (confiable && tecleado !== confiable) {
    avisos.push({ nivel: "error", texto: `El número escrito (${tecleado}) no coincide con el que leímos en ${origen}: ${confiable}.` });
  } else if (confiable && tecleado === confiable) {
    avisos.push({ nivel: "ok", texto: mrz?.numeroValido ? "Número verificado con la MRZ del pasaporte." : "El número coincide con la foto del pasaporte." });
  }
  if (lectura?.confidence === "low") {
    avisos.push({ nivel: "alerta", texto: "La foto se leyó con poca confianza (borrosa o cortada). Mírala a ojo o pide otra." });
  }

  const nacLeido = mrz?.nacimientoValido ? mrz.nacimiento : lectura?.birth_date ?? null;
  if (escrito.birth_date && nacLeido && escrito.birth_date !== nacLeido) {
    avisos.push({ nivel: "alerta", texto: `La fecha de nacimiento escrita (${fechaCorta(escrito.birth_date)}) no coincide con la del pasaporte (${fechaCorta(nacLeido)}).` });
  }

  const vence = escrito.passport_expiry_date ?? (mrz?.vencimientoValido ? mrz.vencimiento : lectura?.passport_expiry_date) ?? null;
  if (vence && regreso) {
    const minimo = masMeses(regreso, 6);
    if (vence < regreso) {
      avisos.push({ nivel: "error", texto: `El pasaporte vence el ${fechaCorta(vence)}, antes de terminar el camino. Tiene que renovarlo.` });
    } else if (vence < minimo) {
      avisos.push({ nivel: "error", texto: `El pasaporte vence el ${fechaCorta(vence)}: necesita al menos 6 meses de vigencia después del regreso (hasta el ${fechaCorta(minimo)}). Tiene que renovarlo.` });
    }
  } else if (tieneArchivo && !vence) {
    avisos.push({ nivel: "alerta", texto: "No sabemos cuándo vence el pasaporte." });
  }

  return avisos;
}

/** ¿Hay algo que el equipo tenga que mirar? */
export const hayProblema = (avisos: Aviso[]) => avisos.some((a) => a.nivel !== "ok");
