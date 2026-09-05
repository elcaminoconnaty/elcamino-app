import { COLOR, CONTACTO, ESCALA_PDF, FUENTE } from "@/lib/brand";
import { Document, Image, Page, StyleSheet, Text, View } from "./brand-shell";
import type { BloqueMinuta, DatosContrato, Minuta, ParteFirma } from "@/lib/contracts/minuta";
import { rellenar } from "@/lib/contracts/minuta";

/**
 * El contrato: acuerdo de prestación de servicios + pagaré en blanco + carta de instrucciones,
 * los tres en un solo documento, como los venían firmando en ZapSign.
 *
 * El texto no vive acá — viene de la minuta (`app_settings.contract_template`). Este archivo
 * solo decide cómo se ve. Así el articulado se puede corregir sin desplegar, y el diseño se
 * puede cambiar sin tocar una coma legal.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontSize: 9,
    fontFamily: FUENTE.body,
    color: COLOR.noche,
    backgroundColor: COLOR.alba,
    lineHeight: 1.55,
  },
  tituloDoc: {
    fontSize: 13,
    fontFamily: FUENTE.display,
    fontWeight: 700,
    color: COLOR.atlantico,
    textAlign: "center",
    letterSpacing: 0.8,
  },
  subtituloDoc: {
    fontSize: 11,
    fontFamily: FUENTE.display,
    color: COLOR.ocre,
    textAlign: "center",
    letterSpacing: 2,
    marginTop: 4,
    marginBottom: 22,
  },
  seccion: {
    fontSize: 10,
    fontFamily: FUENTE.display,
    fontWeight: 700,
    color: COLOR.atlantico,
    textAlign: "center",
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 10,
  },
  parrafo: { textAlign: "justify", marginBottom: 8 },
  /* El articulado tiene dos niveles de lista: letras (a., b., c.) y, dentro de la letra d.
     de la cláusula 6, números romanos (i., ii., …). Sangrarlos es lo que hace legible la
     cláusula de exoneración, que es la más densa del contrato. */
  lista1: { textAlign: "justify", marginBottom: 8, marginLeft: 18 },
  lista2: { textAlign: "justify", marginBottom: 8, marginLeft: 36 },
  /* Los espacios en blanco del pagaré ("La suma de ______ pesos") no se justifican: el
     justificado estira los espacios y rompe la raya en trozos con huecos. */
  parrafoRaya: { textAlign: "left", marginBottom: 8 },
  /** El "1. OBJETO. –" o "PARÁGRAFO PRIMERO. –" que abre el párrafo. */
  guia: { fontFamily: FUENTE.body, fontWeight: 700, color: COLOR.atlantico },

  tituloAnexo: {
    fontSize: 11,
    fontFamily: FUENTE.display,
    fontWeight: 700,
    color: COLOR.atlantico,
    textAlign: "center",
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 14,
  },

  firmas: { flexDirection: "row", marginTop: 28, marginBottom: 8 },
  firmaCol: { flex: 1, paddingRight: 18 },
  firmaTitulo: { fontSize: ESCALA_PDF.caption, color: COLOR.castano, marginBottom: 34 },
  /** El trazo del canvas se dibuja justo encima de la raya. */
  firmaTrazo: { height: 34, marginBottom: -32, objectFit: "contain" },
  firmaRaya: { borderTopWidth: 0.8, borderTopColor: COLOR.noche, width: "88%", marginBottom: 4 },
  firmaNombre: { fontSize: ESCALA_PDF.caption, fontFamily: FUENTE.body, fontWeight: 700 },
  firmaDoc: { fontSize: ESCALA_PDF.micro, color: COLOR.castano },

  pie: {
    position: "absolute",
    bottom: 30,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6.5,
    color: COLOR.niebla,
    borderTopWidth: 0.5,
    borderTopColor: COLOR.piedra,
    paddingTop: 6,
  },
});

/** Rótulo que abre un párrafo: "1. OBJETO. –", "PARÁGRAFO SEGUNDO. –", "Sumas. –". */
const GUIA = new RegExp("^((?:\\d+\\.\\s+)?(?:PARÁGRAFO(?:\\s+[A-ZÁÉÍÓÚÜÑ]+)?|[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑa-záéíóúüñ\\s]{2,60}?)\\.\\s*[–-]\\s*)");

/**
 * Separa el rótulo que abre un párrafo del resto, para poder destacarlo.
 * Cubre "1. OBJETO. –", "PARÁGRAFO SEGUNDO. –", "Sumas. –" y "a. Título. –".
 */
function partirGuia(texto: string): [string, string] {
  // Sin escapes de propiedad unicode (\p{Lu}): el target de este proyecto es anterior a ES2018.
  const m = texto.match(GUIA);
  return m ? [m[1], texto.slice(m[1].length)] : ["", texto];
}

/**
 * Nivel de sangría de cada párrafo.
 *
 * "a. " abre nivel 1 y "iii. " nivel 2, pero lo que importa es que los párrafos que
 * *continúan* un ítem se quedan en su nivel — así lo hace el documento original, y es lo
 * que mantiene legible la cláusula 6, que es la más densa. Solo una cláusula numerada o un
 * PARÁGRAFO vuelven al margen.
 *
 * (Los romanos i., v. y x. también son letras válidas, pero en este articulado la numeración
 * romana solo aparece anidada bajo la letra d., así que comprobarla primero es correcto.)
 */
const ITEM_LETRA = /^[a-z]\.\s/;
const ITEM_ROMANO = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\.\s/;
const VUELVE_AL_MARGEN = /^(?:\d+\.\s|PARÁGRAFO)/;
/** Párrafo con espacios para diligenciar a mano (el pagaré). */
const TIENE_RAYA = /_{4,}/;

/**
 * Las rayas del pagaré son de doscientos y pico guiones bajos seguidos: una sola "palabra"
 * sin ningún punto de corte. El motor de composición no puede cerrar la línea y revienta
 * ("unsupported number: -2.9e+21"). Se parten con saltos de línea explícitos, que no dibujan
 * nada — a diferencia del guionado, que deja un guion colgando al final de cada trozo.
 */
const RAYA_POR_LINEA = 76;
function partirRayas(texto: string): string {
  return texto.replace(/_{4,}/g, (raya) => (raya.match(new RegExp(`.{1,${RAYA_POR_LINEA}}`, "g")) ?? [raya]).join("\n"));
}

function calcularNiveles(bloques: BloqueMinuta[]): number[] {
  let actual = 0;
  return bloques.map((b) => {
    if (b.tipo !== "parrafo") { actual = 0; return 0; }
    if (VUELVE_AL_MARGEN.test(b.texto)) actual = 0;
    else if (ITEM_ROMANO.test(b.texto)) actual = 2;
    else if (ITEM_LETRA.test(b.texto)) actual = 1;
    return actual;
  });
}

const ESTILO_NIVEL = [null, "lista1", "lista2"] as const;

function Parrafo({ texto: crudo, nivel }: { texto: string; nivel: number }) {
  const texto = TIENE_RAYA.test(crudo) ? partirRayas(crudo) : crudo;
  const [guia, resto] = partirGuia(texto);
  const clave = ESTILO_NIVEL[nivel];
  const estilo = TIENE_RAYA.test(texto) ? styles.parrafoRaya : clave ? styles[clave] : styles.parrafo;
  return (
    <Text style={estilo}>
      {guia ? <Text style={styles.guia}>{guia}</Text> : null}
      {resto}
    </Text>
  );
}

/** Las firmas del contrato. `trazos` trae el PNG del canvas por rol, si ya firmaron. */
function Firmas({ partes, trazos }: { partes: ParteFirma[]; trazos?: Partial<Record<string, string>> }) {
  return (
    <View style={styles.firmas} wrap={false}>
      {partes.map((p, i) => {
        const trazo = trazos?.[p.rol];
        return (
          <View key={i} style={styles.firmaCol}>
            <Text style={styles.firmaTitulo}>{p.titulo}</Text>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf no acepta alt */}
            {trazo ? <Image style={styles.firmaTrazo} src={trazo} /> : null}
            <View style={styles.firmaRaya} />
            <Text style={styles.firmaNombre}>{p.nombre}</Text>
            <Text style={styles.firmaDoc}>{p.documento}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Bloque({ b, nivel, trazos }: { b: BloqueMinuta; nivel: number; trazos?: Partial<Record<string, string>> }) {
  if (b.tipo === "seccion") return <Text style={styles.seccion}>{b.texto}</Text>;
  if (b.tipo === "firmas") return <Firmas partes={b.partes} trazos={trazos} />;
  return <Parrafo texto={b.texto} nivel={nivel} />;
}

export type ContratoProps = {
  minuta: Minuta;
  datos: DatosContrato;
  /** Número corto del contrato, para el pie. */
  codigo: string;
  /** PNG en data URL del trazo de cada firmante, cuando ya firmaron. */
  trazos?: Partial<Record<"viajero" | "camino", string>>;
};

export function ContratoPDF({ minuta, datos, codigo, trazos }: ContratoProps) {
  // La minuta se rellena una sola vez, acá: el resto del componente ya no ve placeholders.
  const llenar = (b: BloqueMinuta): BloqueMinuta =>
    b.tipo === "firmas"
      ? { ...b, partes: b.partes.map((p) => ({ ...p, nombre: rellenar(p.nombre, datos), documento: rellenar(p.documento, datos) })) }
      : { ...b, texto: rellenar(b.texto, datos) };

  return (
    <Document title={`${minuta.titulo} · ${datos.viajero_nombre}`} author={CONTACTO.marca}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.tituloDoc}>{minuta.titulo}</Text>
        <Text style={styles.subtituloDoc}>{minuta.subtitulo}</Text>

        {minuta.partes.map((b, i) => (
          <Bloque key={`p${i}`} b={llenar(b)} nivel={0} />
        ))}

        {minuta.secciones.map((s, iSec) => {
          const niveles = calcularNiveles(s.bloques);
          return (
          // Cada anexo arranca en página nueva, como en el documento original.
          <View key={s.clave} break={iSec > 0}>
            {s.titulo ? <Text style={styles.tituloAnexo}>{rellenar(s.titulo, datos)}</Text> : null}
            {s.bloques.map((b, i) => (
              <Bloque key={`${s.clave}${i}`} b={llenar(b)} nivel={niveles[i]} trazos={trazos} />
            ))}
          </View>
          );
        })}

        {/* Pie estático a propósito: en react-pdf 4.5.1 cualquier `render` dinámico dentro
            de un elemento `fixed` revienta el layout en documentos de este largo
            ("unsupported number: -2.9e+21"). La numeración y el total de páginas van en el
            Informe de Firmas, que es donde vive la integridad del documento — junto con el
            SHA-256, que es una garantía más fuerte que un número de página. */}
        <View style={styles.pie} fixed>
          <Text>
            {CONTACTO.marca} · Contrato {codigo} · minuta {minuta.version}
          </Text>
          <Text>{CONTACTO.sitio}</Text>
        </View>
      </Page>
    </Document>
  );
}
