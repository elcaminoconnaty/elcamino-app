/**
 * La papelería compartida de todos los PDFs de la plataforma.
 *
 * Antes cada documento traía su propia paleta a mano (crema #fdfaf3 + amarillo #f5c518),
 * que no salía de ningún brandbook. Ahora los tres recibos, el contrato y el documento de
 * viaje beben de `lib/brand.ts`, así que la marca se cambia en un sitio.
 *
 * IMPORTANTE — dos trampas de react-pdf que costaron caro en Camino Sacro:
 *
 * 1. Las fuentes se registran acá, al cargar el módulo, y todos los documentos importan
 *    algo de este archivo. Así no hay forma de renderizar sin fuentes registradas. Y
 *    `@react-pdf/renderer` debe resolverse siempre por el mismo camino de importación
 *    ("@react-pdf/renderer", nunca una ruta relativa a node_modules) o revienta con
 *    "Font family not registered" únicamente en producción.
 * 2. El guionado automático parte palabras en español donde no debe ("acomo-dación"),
 *    así que se desactiva.
 *
 * Y una heredada de esta plataforma: no usar el signo menos U+2212 en un PDF. Guion ASCII.
 */
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { COLOR, CONTACTO, ESCALA_PDF, FUENTE } from "@/lib/brand";

const dirFuentes = path.join(process.cwd(), "lib", "fonts");
const ttf = (nombre: string) => path.join(dirFuentes, `${nombre}.ttf`);

Font.register({
  family: FUENTE.display,
  fonts: [
    { src: ttf("Cinzel-Regular"), fontWeight: 400 },
    { src: ttf("Cinzel-Bold"), fontWeight: 700 },
  ],
});
Font.register({
  family: FUENTE.serif,
  fonts: [
    { src: ttf("CormorantGaramond-Regular"), fontWeight: 400 },
    { src: ttf("CormorantGaramond-Italic"), fontWeight: 400, fontStyle: "italic" },
    { src: ttf("CormorantGaramond-SemiBold"), fontWeight: 600 },
  ],
});
Font.register({
  family: FUENTE.body,
  fonts: [
    { src: ttf("DMSans-Regular"), fontWeight: 400 },
    { src: ttf("DMSans-Medium"), fontWeight: 500 },
    { src: ttf("DMSans-Bold"), fontWeight: 700 },
  ],
});

// Sin guionado: en español parte mal ("acomo-dación"). Y ojo — cuando el callback devuelve
// varias partes, react-pdf dibuja un guion en el punto de corte, así que tampoco sirve para
// partir las rayas del pagaré; eso se resuelve con saltos de línea en `contrato.tsx`.
Font.registerHyphenationCallback((palabra) => [palabra]);

/** Bordes y fondos derivados de la paleta, para no repetir rgba a mano. */
export const TRAMA = {
  /** Borde suave sobre Alba. Es Piedra, que ya es el neutro cálido del brandbook. */
  borde: COLOR.piedra,
  /** Borde aún más tenue, para filas de tabla. */
  bordeTenue: "#EFE5D6",
  /** Fondo de cabecera de tabla y de bloques destacados. */
  fondoSuave: "#EFE4D2",
} as const;

/**
 * Tonos semánticos para bloques de estado (saldo a favor, pendiente, liquidado).
 * Antes eran azul/ámbar/verde de Tailwind, que no salían de ninguna paleta. Estos se
 * derivan de Atlántico, Ocre y Musgo, así que un estado nunca rompe la papelería.
 */
export const TONO = {
  /** Neutral, informativo. Saldo a favor del peregrino. */
  info: { fondo: "#E3EAEF", texto: "#2C4353" },
  /** Requiere acción. Saldo pendiente. */
  alerta: { fondo: COLOR.piedra, texto: "#6E5230" },
  /** Cerrado, en orden. Liquidado. */
  ok: { fondo: "#E2E8E1", texto: "#3A4B37" },
} as const;

/**
 * El vocabulario de estilos que comparten todos los documentos. Cada PDF hace
 * `StyleSheet.create({ ...suyos })` y usa estos para lo común.
 */
export const base = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: ESCALA_PDF.body,
    fontFamily: FUENTE.body,
    color: COLOR.noche,
    backgroundColor: COLOR.alba,
  },
  // Membrete
  brandBar: { height: 3, width: 56, backgroundColor: COLOR.ocre, marginBottom: 22 },
  brand: {
    fontSize: 19,
    fontFamily: FUENTE.display,
    fontWeight: 700,
    letterSpacing: 1.2,
    color: COLOR.atlantico,
    marginBottom: 5,
  },
  brandSub: { fontSize: ESCALA_PDF.caption, color: COLOR.castano, marginBottom: 30 },

  // Títulos del documento
  title: { fontSize: ESCALA_PDF.h1, fontFamily: FUENTE.display, fontWeight: 700, color: COLOR.atlantico, marginBottom: 5 },
  subtitle: { fontSize: ESCALA_PDF.caption, color: COLOR.castano, marginBottom: 22 },

  // Secciones
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: ESCALA_PDF.micro,
    fontFamily: FUENTE.body,
    fontWeight: 700,
    color: COLOR.ocre,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 7,
  },

  // Filas etiqueta / valor. El brandbook pide que la etiqueta no compita con el dato.
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  rowLabel: { color: COLOR.castano },
  rowValue: { fontFamily: FUENTE.body, fontWeight: 700, color: COLOR.noche },

  // Bloques
  box: { borderWidth: 1, borderColor: TRAMA.borde, padding: 16, borderRadius: 4, marginBottom: 16 },
  bigAmount: { fontSize: 26, fontFamily: FUENTE.display, fontWeight: 700, color: COLOR.atlantico, marginVertical: 12 },

  /** Nota de contexto. Antes era un amarillo suelto; ahora es Piedra con texto Castaño. */
  noteBox: {
    backgroundColor: COLOR.piedra,
    padding: 12,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: COLOR.ocre,
    fontSize: ESCALA_PDF.caption,
    color: COLOR.castano,
    marginTop: 16,
  },
  noteTitle: { fontFamily: FUENTE.body, fontWeight: 700, color: COLOR.atlantico, marginBottom: 4 },

  // Tablas
  table: { borderWidth: 0.5, borderColor: TRAMA.borde, borderRadius: 3, marginVertical: 8 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: TRAMA.fondoSuave,
    padding: 6,
    fontSize: ESCALA_PDF.micro,
    fontFamily: FUENTE.body,
    fontWeight: 500,
    color: COLOR.castano,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottomWidth: 0.5,
    borderBottomColor: TRAMA.borde,
  },
  tableRow: {
    flexDirection: "row",
    padding: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: TRAMA.bordeTenue,
    fontSize: ESCALA_PDF.caption,
  },
  tableFoot: {
    flexDirection: "row",
    padding: 6,
    backgroundColor: TRAMA.fondoSuave,
    fontSize: ESCALA_PDF.caption,
    fontFamily: FUENTE.body,
    fontWeight: 700,
  },

  footer: {
    position: "absolute",
    bottom: 30,
    left: 48,
    right: 48,
    fontSize: ESCALA_PDF.micro,
    color: COLOR.niebla,
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: TRAMA.borde,
    paddingTop: 8,
  },
});

/** Membrete de marca: barra ocre, nombre en Cinzel, sitio debajo. */
export function Membrete() {
  return (
    <>
      <View style={base.brandBar} />
      <Text style={base.brand}>{CONTACTO.marca}</Text>
      <Text style={base.brandSub}>{CONTACTO.sitio}</Text>
    </>
  );
}

/** Pie de página. `nota` reemplaza el texto por defecto cuando el documento necesita otro. */
export function Pie({ nota }: { nota?: string }) {
  return (
    <Text style={base.footer} fixed>
      {nota ?? `${CONTACTO.marca} · ${CONTACTO.sitio} · Documento generado automáticamente`}
    </Text>
  );
}

/** Reexportados para que los documentos no tengan que importar react-pdf por su cuenta. */
export { Document, Page, StyleSheet, Text, View, Image, Font };
