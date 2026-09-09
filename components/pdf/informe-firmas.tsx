import { COLOR, CONTACTO, ESCALA_PDF, FUENTE } from "@/lib/brand";
import { Image, Page, StyleSheet, Text, View } from "./brand-shell";

/**
 * El Informe de Firmas: la hoja que convierte un PDF en prueba.
 *
 * Es la misma hoja que ya conocen de ZapSign, con una diferencia que allá no existe y acá
 * sí: la **URL pública de verificación**. Guardar la huella del documento y no tener forma
 * de comprobarla fue uno de los hallazgos de la auditoría de Camino Sacro — *"produce la
 * prueba de integridad y no tiene forma de usarla"*.
 *
 * Es una Página, no un Documento: va dentro del mismo PDF del contrato, después de la
 * carta de instrucciones. Un informe en archivo aparte se separa del documento que acredita.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 40, paddingBottom: 48, paddingHorizontal: 56,
    fontSize: 8.5, fontFamily: FUENTE.body, color: COLOR.noche, backgroundColor: COLOR.alba,
  },
  titulo: {
    fontSize: 13, fontFamily: FUENTE.display, fontWeight: 700,
    color: COLOR.atlantico, letterSpacing: 1, marginBottom: 3,
  },
  zona: { fontSize: ESCALA_PDF.micro, color: COLOR.castano, marginBottom: 14 },

  cinta: {
    backgroundColor: COLOR.piedra, borderLeftWidth: 3, borderLeftColor: COLOR.ocre,
    padding: 10, borderRadius: 4, marginBottom: 12,
  },
  rotulo: {
    fontSize: ESCALA_PDF.micro, color: COLOR.ocreProfundo,
    textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 3,
  },
  fila: { flexDirection: "row", marginBottom: 3 },
  filaClave: { width: 130, color: COLOR.castano },
  /* Dentro de la ficha de cada firmante las claves son cortas: menos ancho, más valor. */
  filaClaveCorta: { width: 78, color: COLOR.castano },
  filaValor: { flex: 1 },
  /* La huella se parte en grupos de cuatro para que se pueda leer y dictar. */
  huella: { fontSize: 7.5, letterSpacing: 0.3 },

  seccion: {
    fontSize: ESCALA_PDF.micro, color: COLOR.ocreProfundo, textTransform: "uppercase",
    letterSpacing: 1.5, marginTop: 4, marginBottom: 8,
    borderBottomWidth: 0.5, borderBottomColor: COLOR.piedra, paddingBottom: 5,
  },

  firmante: {
    borderWidth: 0.5, borderColor: COLOR.piedra, borderRadius: 4,
    padding: 10, marginBottom: 10,
  },
  firmanteCabeza: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  firmanteNombre: { fontFamily: FUENTE.body, fontWeight: 700, fontSize: 10, color: COLOR.atlantico },
  firmanteRol: { fontSize: ESCALA_PDF.micro, color: COLOR.ocreProfundo, textTransform: "uppercase", letterSpacing: 1.2 },
  trazo: { height: 36, width: 150, objectFit: "contain", marginBottom: 5 },
  trazoMecanico: { fontFamily: FUENTE.serif, fontStyle: "italic", fontSize: 16, color: COLOR.noche, marginBottom: 6 },
  cols: { flexDirection: "row" },
  col: { flex: 1, paddingRight: 10 },

  legal: { fontSize: 7.5, color: COLOR.castano, lineHeight: 1.45, marginTop: 8 },
  pie: {
    position: "absolute", bottom: 30, left: 56, right: 56,
    fontSize: 6.5, color: COLOR.niebla, textAlign: "center",
    borderTopWidth: 0.5, borderTopColor: COLOR.piedra, paddingTop: 6,
  },
});

export type FirmanteInforme = {
  rol: "camino" | "viajero";
  rolTexto: string;
  /** Identificador único de esta firma (el id del firmante), como el "Token" de ZapSign. */
  token: string;
  nombre: string;
  documento: string;
  email: string;
  telefono: string | null;
  firmadoEn: string;
  ip: string | null;
  dispositivo: string | null;
  ubicacion: string | null;
  metodo: string;
  /** Data URL del trazo del canvas. */
  trazo?: string | null;
};

export type InformeFirmasProps = {
  numero: string;
  creadoEn: string;
  /** Momento en que se selló el documento: la última firma. */
  actualizadoEn: string;
  documento: string;
  /** SHA-256 del PDF antes de firmar, ya agrupado de a cuatro. */
  huellaOriginal: string;
  urlVerificacion: string;
  firmantes: FirmanteInforme[];
  paginas: number;
};

function Fila({ k, v, corta, mono }: { k: string; v: string; corta?: boolean; mono?: boolean }) {
  return (
    <View style={styles.fila}>
      <Text style={corta ? styles.filaClaveCorta : styles.filaClave}>{k}</Text>
      <Text style={mono ? [styles.filaValor, styles.huella] : styles.filaValor}>{v}</Text>
    </View>
  );
}

export function PaginaInformeFirmas(p: InformeFirmasProps) {
  return (
      <Page size="A4" style={styles.page} break>
        <Text style={styles.titulo}>Informe de Firmas</Text>
        <Text style={styles.zona}>
          Fechas y horas en UTC-0500 (America/Bogota) · Última actualización: {p.actualizadoEn}
        </Text>

        <View style={styles.cinta}>
          <Text style={styles.rotulo}>Estado</Text>
          <Text style={{ fontFamily: FUENTE.body, fontWeight: 700, fontSize: 11, color: COLOR.atlantico, marginBottom: 8 }}>
            Firmado
          </Text>
          <Fila k="Documento" v={p.documento} />
          <Fila k="Número" v={p.numero} />
          <Fila k="Fecha de creación" v={p.creadoEn} />
          <Fila k="Páginas" v={String(p.paginas)} />
          <View style={styles.fila}>
            <Text style={styles.filaClave}>Huella del documento</Text>
            <Text style={[styles.filaValor, styles.huella]}>SHA-256 {p.huellaOriginal}</Text>
          </View>
        </View>

        <Text style={styles.seccion}>
          Firmas · {p.firmantes.length} de {p.firmantes.length}
        </Text>

        {p.firmantes.map((f) => (
          <View key={f.rol} style={styles.firmante} wrap={false}>
            <View style={styles.firmanteCabeza}>
              <Text style={styles.firmanteNombre}>{f.nombre}</Text>
              <Text style={styles.firmanteRol}>{f.rolTexto}</Text>
            </View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf no acepta alt */}
            {f.trazo ? (
              <Image style={styles.trazo} src={f.trazo} />
            ) : (
              <Text style={styles.trazoMecanico}>{f.nombre}</Text>
            )}
            <View style={styles.cols}>
              <View style={styles.col}>
                <Fila corta k="Documento" v={f.documento} />
                <Fila corta k="Correo" v={f.email} />
                {f.telefono ? <Fila corta k="Teléfono" v={f.telefono} /> : null}
                <Fila corta k="Firmado el" v={f.firmadoEn} />
              </View>
              <View style={styles.col}>
                <Fila corta k="Verificación" v={f.metodo} />
                {f.ip ? <Fila corta k="Dirección IP" v={f.ip} /> : null}
                {f.ubicacion ? <Fila corta k="Ubicación" v={`${f.ubicacion} (aprox., reportada por el dispositivo)`} /> : null}
              </View>
            </View>
            <Fila corta mono k="Token" v={f.token} />
            {f.dispositivo ? <Fila corta k="Dispositivo" v={f.dispositivo.slice(0, 160)} /> : null}
          </View>
        ))}

        <Text style={styles.seccion}>Cumplimiento legal de la firma electrónica</Text>
        <Text style={styles.legal}>
          Este documento fue firmado electrónicamente conforme a la Ley 527 de 1999 y al Decreto 2364 de 2012 de
          la República de Colombia. Los datos que aparecen arriba se capturaron en el momento de cada firma para
          acreditar la autoría y la integridad del documento. Cada firmante aceptó de forma expresa que este
          método constituye su firma y lo obliga en los mismos términos que una firma manuscrita.
          {"\n\n"}
          Para comprobar que el archivo que tiene en sus manos es exactamente el que se firmó, calcule su
          huella SHA-256 y péguela en {p.urlVerificacion}. Si el documento hubiera sido alterado en un solo
          carácter, la huella sería distinta. (La huella del documento firmado no puede ir impresa dentro de
          él mismo: calcularla sobre el archivo terminado y luego escribirla dentro lo cambiaría.)
          {"\n\n"}
          Este registro es parte integral del documento número {p.numero}.
        </Text>

        <Text style={styles.pie} fixed>
          {CONTACTO.marca} · {CONTACTO.sitio} · Informe de firmas del documento {p.numero}
        </Text>
      </Page>
  );
}
