/**
 * Validación y formato de datos bancarios europeos. Un IBAN mal copiado se descubre
 * en el banco, con la transferencia rechazada y el proveedor esperando; acá se descubre
 * al guardarlo.
 */

/** Largo oficial del IBAN por país (los que aparecen en el Camino y alrededores). */
const LARGO_IBAN: Record<string, number> = {
  ES: 24, PT: 25, FR: 27, IT: 27, DE: 22, NL: 18, BE: 16, IE: 22,
  GB: 22, CH: 21, AT: 20, LU: 20, DK: 18, SE: 24, NO: 15, FI: 18, PL: 28,
};

export function normalizarIban(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "ES91 2100 0418 4502 0005 1332": en grupos de 4, que es como se lee y se teclea. */
export function formatearIban(v: string | null | undefined): string {
  const limpio = normalizarIban(v);
  return limpio.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * El dígito de control del IBAN (ISO 13616): se mueven los 4 primeros caracteres al
 * final, cada letra vale su posición + 9, y el número resultante debe dar 1 mod 97.
 */
function mod97(iban: string): number {
  const rotado = iban.slice(4) + iban.slice(0, 4);
  let resto = 0;
  for (const ch of rotado) {
    const valor = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of valor) resto = (resto * 10 + Number(d)) % 97;
  }
  return resto;
}

/** `null` si está bien; si no, qué tiene de malo, en español y sin tecnicismos. */
export function validarIban(v: string | null | undefined): string | null {
  const iban = normalizarIban(v);
  if (!iban) return null;
  if (iban.length < 15 || iban.length > 34) return "El IBAN tiene un largo raro: revisá que esté completo.";
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return "El IBAN debe empezar con dos letras de país y dos números.";
  const pais = iban.slice(0, 2);
  const largo = LARGO_IBAN[pais];
  if (largo && iban.length !== largo) return `Un IBAN de ${pais} tiene ${largo} caracteres y este tiene ${iban.length}.`;
  if (mod97(iban) !== 1) return "El IBAN no pasa el dígito de control: hay un número mal copiado.";
  return null;
}

/** SWIFT/BIC: 8 u 11 caracteres (banco, país, plaza y, opcional, sucursal). */
export function validarSwift(v: string | null | undefined): string | null {
  const swift = (v ?? "").toUpperCase().replace(/\s/g, "");
  if (!swift) return null;
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(swift)) {
    return "El SWIFT/BIC va en 8 u 11 caracteres, ej. CAGLESMMXXX.";
  }
  return null;
}

/** El país del IBAN (sus dos primeras letras), para avisar cuando el giro sale de España. */
export function paisDelIban(v: string | null | undefined): string | null {
  const iban = normalizarIban(v);
  return iban.length >= 2 ? iban.slice(0, 2) : null;
}
