/**
 * El texto que el firmante acepta. Se guarda en `contract_signers.consent_text` junto con
 * la firma: si mañana cambia esta constante, los contratos ya firmados siguen diciendo qué
 * aceptó cada uno.
 *
 * La segunda casilla es el acuerdo sobre el método que exige el artículo 7 de la Ley 527:
 * es lo que convierte el clic en firma. La autorización de tratamiento de datos no está
 * acá sino en la cláusula 18 del contrato, dentro del PDF que se hashea y se firma —
 * un checkbox vive en el código y cambia con un despliegue; una cláusula, no.
 */
export const CONSENTIMIENTO = {
  lectura:
    "He leído y acepto el Acuerdo de Prestación de Servicios Turísticos, el Pagaré en Blanco No. 01, " +
    "la Carta de Instrucciones y el Anexo No. 1 con las condiciones del viaje.",
  firma:
    "Acepto que este método de firma electrónica constituye mi firma y me obliga en los mismos " +
    "términos que una firma manuscrita, conforme a la Ley 527 de 1999 y el Decreto 2364 de 2012. " +
    "Entiendo que quedan registrados mi nombre, mi documento, la fecha y hora, mi dirección IP, " +
    "el dispositivo desde el que firmo y la huella digital del documento.",
} as const;

/** El consentimiento completo, tal como se archiva. */
export function textoConsentimiento(): string {
  return `${CONSENTIMIENTO.lectura}\n\n${CONSENTIMIENTO.firma}`;
}
