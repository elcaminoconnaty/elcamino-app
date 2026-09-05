import semilla from "./minuta.seed.json";

/**
 * La minuta del contrato: el texto legal, palabra por palabra.
 *
 * Vive en la base (`app_settings.contract_template`), no en este archivo. El archivo solo
 * trae la versión de fábrica, transcrita de los dos contratos firmados en ZapSign
 * (José Iván Reséndiz, sept-2026 · Luz Helena García, abril-2027) y verificada palabra por
 * palabra contra los dos.
 *
 * Está en la base a propósito, y es la lección más cara de la auditoría de Camino Sacro:
 * allá el articulado quedó en TypeScript mientras las condiciones del documento de viaje
 * vivían en `settings` y se editaban sin desplegar. En cuanto alguien mueva la política de
 * devoluciones, se actualiza el lado fácil y el contrato sigue diciendo lo viejo. Acá los
 * dos salen del mismo sitio.
 *
 * Cada contrato guarda la `version` de la minuta con la que se generó, así que dentro de
 * dos años se puede saber qué firmó alguien sin abrir su PDF.
 *
 * Una nota de transcripción: los dos originales se contradicen en cómo escriben el nombre
 * del viajero dentro del pagaré y de la carta de instrucciones — el de julio en Título, el
 * de agosto en MAYÚSCULAS. Se unificó en MAYÚSCULAS, que es lo que hace el más reciente y
 * lo que ya hacían los dos en los bloques de firma. El articulado no cambia.
 */

export type BloqueMinuta =
  | { tipo: "parrafo"; texto: string }
  | { tipo: "seccion"; texto: string }
  | { tipo: "firmas"; partes: ParteFirma[] };

export type ParteFirma = {
  rol: "viajero" | "camino";
  titulo: string;
  nombre: string;
  documento: string;
};

export type Minuta = {
  version: string;
  titulo: string;
  subtitulo: string;
  partes: BloqueMinuta[];
  secciones: Array<{ clave: string; titulo: string | null; bloques: BloqueMinuta[] }>;
};

/** Los trece datos que cambian de un peregrino a otro. Todo lo demás es idéntico. */
export type DatosContrato = {
  /** Nombre completo, en MAYÚSCULAS. */
  viajero_nombre: string;
  /** "identificado" o "identificada", según el sexo registrado. */
  viajero_identificado: string;
  /** "el pasaporte N01300944" o "la cédula de ciudadanía número 1.037.593.713". */
  viajero_documento_frase: string;
  /** "P.A. N01300944" o "C.C. 1.037.593.713", para el bloque de firma. */
  viajero_documento_label: string;
  /** Dirección física de notificaciones (cláusula 23). */
  viajero_direccion: string;
  viajero_email: string;
  /** "EL CAMINO DE SANTIAGO FRANCÉS - ORIGEN: … - DESTINO: … - dd/mm/aa - dd/mm/aa". */
  plan_descripcion: string;
  /** Enlace público al brochure, que es el Anexo No. 1. */
  anexo1_url: string;
  /** "2.529,00 euros". */
  valor_total: string;
  /** El plan de cuotas en prosa, como lo pactó Naty. */
  forma_de_pago: string;
  seguro_desde: string;
  seguro_hasta: string;
  /** Fecha de suscripción, en letra: "06 de agosto de 2026". */
  fecha_firma: string;
};

export const CAMPOS_CONTRATO = [
  "viajero_nombre",
  "viajero_identificado",
  "viajero_documento_frase",
  "viajero_documento_label",
  "viajero_direccion",
  "viajero_email",
  "plan_descripcion",
  "anexo1_url",
  "valor_total",
  "forma_de_pago",
  "seguro_desde",
  "seguro_hasta",
  "fecha_firma",
] as const satisfies ReadonlyArray<keyof DatosContrato>;

/** La versión de fábrica que trae el repo. Se usa mientras nadie haya publicado otra. */
export const MINUTA_DE_FABRICA = semilla as Minuta;

/** Rellena `{{campo}}`. Si falta un dato, lo dice: un contrato no se emite a medias. */
export function rellenar(texto: string, datos: DatosContrato): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, campo: string) => {
    const valor = (datos as Record<string, string>)[campo];
    if (valor == null || valor.trim() === "") {
      throw new Error(`Falta el dato "${campo}" para generar el contrato.`);
    }
    return valor;
  });
}

/**
 * Comprueba que estén los trece datos antes de renderizar nada.
 * Devuelve los que falten, para que la pantalla los pueda listar en claro.
 */
export function camposFaltantes(datos: Partial<DatosContrato>): string[] {
  return CAMPOS_CONTRATO.filter((c) => {
    const v = datos[c];
    return v == null || String(v).trim() === "";
  });
}
