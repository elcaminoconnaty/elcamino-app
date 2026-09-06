import { COLOR, CONTACTO, ESCALA_PDF, FUENTE, OVERLAY_FOTO } from "@/lib/brand";
import { Circle, Document, G, Image, Line, Page, StyleSheet, Svg, Text, View } from "./brand-shell";
import { Text as SvgText } from "@react-pdf/renderer";
import type { Alojamiento, DiaItinerario, DocumentoDeViaje } from "@/lib/travel-doc/datos";
import { fechaBreve } from "@/lib/travel-doc/datos";

/**
 * El documento de viaje.
 *
 * Misma estructura que el que Naty venía armando a mano —portada, itinerario general con el
 * mapa de etapas, una ficha por alojamiento y contraportada— pero todo sale de la base y
 * todo es editable.
 *
 * Cambia lo que la edición 2027 del brandbook corrige:
 *  · El rótulo va en ocre profundo y pequeño; el dato en noche. Antes competían.
 *  · Siempre CIUDAD: NOMBRE. El documento anterior lo hacía a veces.
 *  · Las noches seguidas en el mismo hotel son una ficha, no dos páginas idénticas.
 *  · Cada alojamiento dice su etapa y sus km, que antes había que ir a buscar a la página 2.
 *  · El texto sobre foto lleva velo de noche al 55 %.
 */

const s = StyleSheet.create({
  // ── Portada ────────────────────────────────────────────────────────────────
  portada: { position: "relative", backgroundColor: COLOR.noche },
  portadaFoto: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" },
  velo: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: OVERLAY_FOTO },
  portadaTexto: { position: "absolute", top: 96, left: 48, right: 48, alignItems: "center" },
  recorrido: { fontSize: 10, color: COLOR.alba, letterSpacing: 0.6, marginBottom: 14 },
  tituloRuta: {
    fontFamily: FUENTE.display, fontWeight: 700, fontSize: 40,
    color: COLOR.alba, letterSpacing: 3, textAlign: "center",
  },
  tituloSub: {
    fontFamily: FUENTE.serif, fontStyle: "italic", fontSize: 22,
    color: COLOR.ocreClaro, marginTop: 6, textAlign: "center",
  },
  tagline: {
    position: "absolute", bottom: 132, left: 64, right: 64,
    fontFamily: FUENTE.serif, fontSize: 16, color: COLOR.alba,
    textAlign: "center", lineHeight: 1.4,
  },
  banda: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: COLOR.atlantico, paddingVertical: 20, paddingHorizontal: 48,
  },
  bandaTexto: { fontFamily: FUENTE.display, fontSize: 13, color: COLOR.alba, letterSpacing: 2.4 },
  bandaFecha: { fontFamily: FUENTE.display, fontSize: 13, color: COLOR.ocreClaro, letterSpacing: 2.4, marginTop: 4 },

  // ── Páginas interiores ─────────────────────────────────────────────────────
  pagina: {
    paddingTop: 0, paddingBottom: 56, fontSize: ESCALA_PDF.body,
    fontFamily: FUENTE.body, color: COLOR.noche, backgroundColor: COLOR.alba,
  },
  cabecera: {
    backgroundColor: COLOR.atlantico, paddingVertical: 18, paddingHorizontal: 44,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 34,
  },
  cabeceraMarca: { fontFamily: FUENTE.display, fontSize: 11, color: COLOR.alba, letterSpacing: 2.2 },
  cabeceraSeccion: { fontSize: ESCALA_PDF.micro, color: COLOR.ocreClaro, letterSpacing: 2, textTransform: "uppercase" },
  cuerpo: { paddingHorizontal: 44 },

  h1: {
    fontFamily: FUENTE.display, fontWeight: 700, fontSize: 17,
    color: COLOR.atlantico, letterSpacing: 1.4, marginBottom: 20,
  },

  // Tabla del itinerario
  tabla: { marginBottom: 26 },
  filaCab: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLOR.piedra, paddingBottom: 7, marginBottom: 4,
  },
  th: {
    fontSize: ESCALA_PDF.micro, color: COLOR.ocreProfundo,
    textTransform: "uppercase", letterSpacing: 1.4, fontWeight: 700,
  },
  fila: { flexDirection: "row", paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: "#EFE5D6" },
  cFecha: { width: 96 },
  cLugar: { flex: 1.2, paddingRight: 8 },
  cCama: { flex: 1.3 },
  fecha: { fontFamily: FUENTE.body, fontWeight: 700, fontSize: 10, color: COLOR.noche },
  rotuloDia: { fontSize: ESCALA_PDF.micro, color: COLOR.ocreProfundo, marginTop: 1 },
  dato: { fontSize: 10, color: COLOR.noche },
  datoTenue: { fontSize: 10, color: COLOR.castano },

  // Mapa de etapas
  mapa: { marginTop: 10, paddingTop: 18, borderTopWidth: 1, borderTopColor: COLOR.piedra },

  // ── Ficha de alojamiento ───────────────────────────────────────────────────
  ficha: { marginBottom: 30 },
  fichaTitulo: {
    fontFamily: FUENTE.display, fontWeight: 700, fontSize: 13,
    color: COLOR.atlantico, letterSpacing: 1.2, marginBottom: 3,
  },
  fichaEtapa: { fontSize: ESCALA_PDF.caption, color: COLOR.ocreProfundo, marginBottom: 12 },
  fotos: { flexDirection: "row", gap: 6, marginBottom: 14 },
  foto: { flex: 1, height: 118, objectFit: "cover" },
  fotoVacia: {
    flex: 1, height: 118, backgroundColor: COLOR.piedra,
    alignItems: "center", justifyContent: "center",
  },
  fotoVaciaTexto: { fontSize: ESCALA_PDF.micro, color: COLOR.castano },

  datos: { flexDirection: "row", gap: 28 },
  datosCol: { flex: 1 },
  campo: { marginBottom: 9 },
  campoRotulo: {
    fontSize: ESCALA_PDF.micro, color: COLOR.ocreProfundo,
    textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 2,
  },
  campoValor: { fontSize: 10.5, color: COLOR.noche, lineHeight: 1.4 },
  nota: {
    marginTop: 10, backgroundColor: COLOR.piedra, borderLeftWidth: 3, borderLeftColor: COLOR.ocre,
    padding: 9, fontSize: ESCALA_PDF.caption, color: COLOR.castano,
  },

  pie: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: COLOR.atlantico, paddingVertical: 14, paddingHorizontal: 44,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  pieMarca: { fontFamily: FUENTE.display, fontSize: 9, color: COLOR.alba, letterSpacing: 2 },
  pieDato: { fontSize: ESCALA_PDF.micro, color: COLOR.ocreClaro, letterSpacing: 1.2 },

  // ── Contraportada ──────────────────────────────────────────────────────────
  cierre: { backgroundColor: COLOR.atlantico, alignItems: "center", justifyContent: "center" },
  cierreMarca: { fontFamily: FUENTE.display, fontWeight: 700, fontSize: 16, color: COLOR.alba, letterSpacing: 4 },
  cierreSub: { fontFamily: FUENTE.serif, fontStyle: "italic", fontSize: 15, color: COLOR.ocreClaro, marginTop: 10 },
  cierreContacto: { fontSize: ESCALA_PDF.caption, color: "#C9D6DD", marginTop: 40, textAlign: "center", lineHeight: 1.7 },
});


/**
 * El trazado de las etapas: una línea con una parada por etapa, los km entre paradas y las
 * horas debajo. Se dibuja desde `route_stages`, así que el mapa del camino siguiente se
 * arma solo — el documento anterior llevaba una imagen fija que había que rehacer a mano.
 */
function MapaDeEtapas({ origen, dias }: { origen: string | null; dias: DiaItinerario[] }) {
  /*
   * El origen es un nodo más: sin él, los kilómetros de la primera etapa no tendrían entre
   * qué dos puntos ir, y el trazado empezaría donde el peregrino ya lleva un día andando.
   */
  const nodos: Array<{ clave: string; lugar: string; km: number | null; horas: string | null }> = [
    ...(origen ? [{ clave: "origen", lugar: origen, km: null, horas: null }] : []),
    ...dias.map((d) => ({ clave: d.fecha, lugar: d.lugar, km: d.km, horas: d.horas })),
  ];

  const ANCHO = 507;
  const ALTO = 76;
  const EJE = 40;
  // Margen holgado: los nombres de los extremos van centrados sobre su punto y con 16 px
  // se salían del dibujo.
  const margen = 46;
  const paso = nodos.length > 1 ? (ANCHO - margen * 2) / (nodos.length - 1) : 0;
  const x = (i: number) => margen + paso * i;

  return (
    <Svg width={ANCHO} height={ALTO}>
      {/* El camino: una línea continua de ocre. */}
      <Line x1={margen} y1={EJE} x2={ANCHO - margen} y2={EJE} strokeWidth={1.2} stroke={COLOR.ocre} />

      {nodos.map((d, i) => (
        <G key={d.clave}>
          <Circle cx={x(i)} cy={EJE} r={4} fill={COLOR.ocre} />
          {/* El lugar arriba, alternando altura para que no se pisen los nombres largos. */}
          <SvgText
            x={x(i)}
            y={i % 2 === 0 ? EJE - 14 : EJE - 26}
            textAnchor="middle"
            style={{ fontFamily: FUENTE.body, fontSize: 7.5, fill: COLOR.noche }}
          >
            {d.lugar}
          </SvgText>
          {/* Los km del tramo, a media distancia de la parada anterior. */}
          {i > 0 && d.km ? (
            <SvgText
              x={(x(i - 1) + x(i)) / 2}
              y={EJE + 16}
              textAnchor="middle"
              style={{ fontFamily: FUENTE.body, fontSize: 7, fill: COLOR.ocreProfundo }}
            >
              {`${d.km.toLocaleString("es-CO")} km`}
            </SvgText>
          ) : null}
          {i > 0 && d.horas ? (
            <SvgText
              x={(x(i - 1) + x(i)) / 2}
              y={EJE + 27}
              textAnchor="middle"
              style={{ fontFamily: FUENTE.body, fontSize: 6.5, fill: COLOR.castano }}
            >
              {d.horas}
            </SvgText>
          ) : null}
        </G>
      ))}
    </Svg>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <View style={s.campo}>
      <Text style={s.campoRotulo}>{rotulo}</Text>
      <Text style={s.campoValor}>{valor}</Text>
    </View>
  );
}

function Cabecera({ seccion }: { seccion: string }) {
  return (
    <View style={s.cabecera} fixed>
      <Text style={s.cabeceraMarca}>{CONTACTO.marca}</Text>
      <Text style={s.cabeceraSeccion}>{seccion}</Text>
    </View>
  );
}

function Pie({ etiqueta }: { etiqueta: string }) {
  return (
    <View style={s.pie} fixed>
      <Text style={s.pieMarca}>El Camino de Santiago</Text>
      <Text style={s.pieDato}>{etiqueta}</Text>
    </View>
  );
}

/** Un alojamiento: el rótulo pequeño en ocre, el dato en noche. */
function FichaAlojamiento({ a }: { a: Alojamiento }) {
  const noches =
    a.noches > 1
      ? `${a.noches} noches · ${fechaBreve(a.desde)} → ${fechaBreve(a.hasta)}`
      : `${fechaBreve(a.desde)}`;

  return (
    <View style={s.ficha} wrap={false}>
      <Text style={s.fichaTitulo}>
        {a.ciudad ? `${a.ciudad.toUpperCase()}: ` : ""}
        {a.nombre.toUpperCase()}
      </Text>
      <Text style={s.fichaEtapa}>
        {[a.etapa, noches].filter(Boolean).join("  ·  ")}
      </Text>

      <View style={s.fotos}>
        {a.fotos.slice(0, 3).map((f, i) => (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf no acepta alt
          <Image key={i} style={s.foto} src={f.url} />
        ))}
        {a.fotos.length === 0 && (
          <View style={s.fotoVacia}>
            <Text style={s.fotoVaciaTexto}>Sin fotos cargadas</Text>
          </View>
        )}
      </View>

      <View style={s.datos}>
        <View style={s.datosCol}>
          <Campo rotulo="Entrada" valor={a.checkIn ? `${fechaBreve(a.desde)} · ${a.checkIn}` : null} />
          <Campo rotulo="Dirección" valor={a.direccion} />
        </View>
        <View style={s.datosCol}>
          <Campo rotulo="Acomodación" valor={a.acomodacion} />
          <Campo rotulo="Desayuno" valor={a.desayuno} />
        </View>
      </View>

      {a.compartidoCon && (
        <Text style={s.nota}>
          Esta noche el grupo se reparte entre {a.nombre} y {a.compartidoCon}. Te decimos cuál te toca
          antes de salir.
        </Text>
      )}
    </View>
  );
}

function FilaItinerario({ d }: { d: DiaItinerario }) {
  return (
    <View style={s.fila}>
      <View style={s.cFecha}>
        <Text style={s.fecha}>{d.fechaPunteada}</Text>
        <Text style={s.rotuloDia}>{d.rotulo}</Text>
      </View>
      <View style={s.cLugar}>
        <Text style={s.dato}>{d.lugar || "—"}</Text>
        {d.km ? (
          <Text style={s.rotuloDia}>
            {d.km.toLocaleString("es-CO")} km{d.horas ? ` · ${d.horas}` : ""}
          </Text>
        ) : null}
      </View>
      <View style={s.cCama}>
        <Text style={d.alojamiento ? s.dato : s.datoTenue}>{d.alojamiento ?? "—"}</Text>
      </View>
    </View>
  );
}

export function DocumentoViajePDF({ doc }: { doc: DocumentoDeViaje }) {
  const caminadas = doc.dias.filter((d) => d.km);
  // El documento se parte en páginas de cuatro fichas para que ninguna quede huérfana.
  const bloques: Alojamiento[][] = [];
  for (let i = 0; i < doc.alojamientos.length; i += 3) {
    bloques.push(doc.alojamientos.slice(i, i + 3));
  }

  return (
    <Document title={`Documento de viaje · ${doc.camino}`} author={CONTACTO.marca}>
      {/* ── Portada ─────────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.portada}>
        {doc.portada.foto ? (
          <>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf no acepta alt */}
            <Image style={s.portadaFoto} src={doc.portada.foto} />
            {/* El brandbook exige velo bajo cualquier texto sobre foto. */}
            <View style={s.velo} />
          </>
        ) : null}

        <View style={s.portadaTexto}>
          {doc.recorrido && (
            <Text style={s.recorrido}>
              {doc.recorrido}
              {doc.km ? `  ·  ${doc.km.toLocaleString("es-CO")} km` : ""}
            </Text>
          )}
          <Text style={s.tituloRuta}>CAMINO</Text>
          <Text style={s.tituloSub}>de Santiago</Text>
        </View>

        <Text style={s.tagline}>{doc.portada.tagline}</Text>

        <View style={s.banda}>
          <Text style={s.bandaTexto}>{doc.portada.banda.toUpperCase()}</Text>
          <Text style={s.bandaFecha}>{doc.etiqueta}</Text>
        </View>
      </Page>

      {/* ── Itinerario general ──────────────────────────────────────────────── */}
      <Page size="A4" style={s.pagina}>
        <Cabecera seccion="Itinerario general" />
        <View style={s.cuerpo}>
          <Text style={s.h1}>ITINERARIO GENERAL</Text>

          <View style={s.tabla}>
            <View style={s.filaCab}>
              <Text style={[s.th, s.cFecha]}>Fecha</Text>
              <Text style={[s.th, s.cLugar]}>Lugar</Text>
              <Text style={[s.th, s.cCama]}>Alojamiento</Text>
            </View>
            {doc.dias.map((d) => (
              <FilaItinerario key={d.fecha + d.rotulo} d={d} />
            ))}
          </View>

          {caminadas.length > 1 && (
            <View style={s.mapa} wrap={false}>
              <Text style={[s.th, { marginBottom: 14 }]}>El trazado</Text>
              <MapaDeEtapas origen={doc.origen} dias={caminadas} />
            </View>
          )}
        </View>
        <Pie etiqueta={doc.etiqueta} />
      </Page>

      {/* ── Alojamientos ────────────────────────────────────────────────────── */}
      {bloques.map((bloque, i) => (
        <Page key={i} size="A4" style={s.pagina}>
          <Cabecera seccion="Información alojamientos" />
          <View style={s.cuerpo}>
            {i === 0 && <Text style={s.h1}>INFORMACIÓN ALOJAMIENTOS</Text>}
            {bloque.map((a) => (
              <FichaAlojamiento key={a.clave} a={a} />
            ))}
          </View>
          <Pie etiqueta={doc.etiqueta} />
        </Page>
      ))}

      {/* ── Contraportada ───────────────────────────────────────────────────── */}
      <Page size="A4" style={[s.pagina, s.cierre]}>
        <Text style={s.cierreMarca}>EL CAMINO</Text>
        <Text style={s.cierreSub}>con Naty</Text>
        <Text style={s.cierreContacto}>
          {CONTACTO.whatsapp}
          {"\n"}
          {CONTACTO.correo}
          {"\n"}
          {CONTACTO.sitio}
        </Text>
      </Page>
    </Document>
  );
}
