import path from "node:path";
import { COLOR, CONTACTO, ESCALA_PDF, FUENTE, OVERLAY_FOTO } from "@/lib/brand";
import { Document, Image, Page, StyleSheet, Text, View } from "./brand-shell";
import type { CartaBienvenida } from "@/lib/bienvenida/datos";
import { fechaDiaMes, fechaLarga } from "@/lib/bienvenida/datos";

/**
 * La carta de bienvenida.
 *
 * Es la carta que Naty armaba a mano (Bienvenida_CaminoFrances_Abril2027_v4.pdf): los mismos
 * textos y las mismas fotos, con la papelería del documento de viaje —Cinzel para los
 * títulos, Cormorant para las citas, DM Sans para leer, cabecera y pie en atlántico, velo
 * de noche sobre las fotos— para que todo lo que recibe el peregrino sea una sola marca.
 *
 * Lo que cambia camino a camino (fechas, lugar del encuentro, etapas, ritual) sale de
 * `armarCarta`; lo que cambia persona a persona es el saludo.
 */

const A4 = { ancho: 595.28, alto: 841.89 };

const foto = (nombre: string) => path.join(process.cwd(), "public", "bienvenida", nombre);

const s = StyleSheet.create({
  // ── Portada y contraportada ────────────────────────────────────────────────
  llena: { position: "relative", backgroundColor: COLOR.noche },
  // Medidas de A4 en puntos y `fixed` en el JSX: si no, react-pdf pagina la foto como un
  // bloque más, no le cabe junto al texto y la manda sola a una hoja nueva.
  fondo: { position: "absolute", top: 0, left: 0, width: A4.ancho, height: A4.alto, objectFit: "cover" },
  velo: { position: "absolute", top: 0, left: 0, width: A4.ancho, height: A4.alto, backgroundColor: OVERLAY_FOTO },
  portadaTexto: { position: "absolute", top: 150, left: 48, right: 48, alignItems: "center" },
  logo: { width: 150, marginBottom: 34 },
  filete: { width: 64, height: 2, backgroundColor: COLOR.ocre, marginVertical: 18 },
  saludoPortada: { fontFamily: FUENTE.display, fontWeight: 700, fontSize: 30, color: COLOR.alba, letterSpacing: 2.5, textAlign: "center" },
  tituloPortada: { fontFamily: FUENTE.display, fontSize: 17, color: COLOR.alba, letterSpacing: 3, marginTop: 10, textAlign: "center" },
  rutaPortada: { fontFamily: FUENTE.serif, fontStyle: "italic", fontSize: 24, color: COLOR.ocreClaro, marginTop: 6, textAlign: "center" },
  datoPortada: { fontSize: 10, color: COLOR.alba, letterSpacing: 0.6, marginTop: 5, textAlign: "center" },
  banda: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: COLOR.atlantico, paddingVertical: 18, paddingHorizontal: 48, alignItems: "center" },
  bandaTexto: { fontFamily: FUENTE.display, fontSize: 11, color: COLOR.alba, letterSpacing: 2.4 },

  // ── Interiores ─────────────────────────────────────────────────────────────
  pagina: { paddingTop: 0, paddingBottom: 60, fontSize: ESCALA_PDF.body + 0.5, fontFamily: FUENTE.body, color: COLOR.noche, backgroundColor: COLOR.alba },
  cabecera: { backgroundColor: COLOR.atlantico, paddingVertical: 16, paddingHorizontal: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 32 },
  cabeceraMarca: { fontFamily: FUENTE.display, fontSize: 10, color: COLOR.alba, letterSpacing: 2.2 },
  cabeceraSeccion: { fontSize: ESCALA_PDF.micro, color: COLOR.ocreClaro, letterSpacing: 2, textTransform: "uppercase" },
  cuerpo: { paddingHorizontal: 44 },
  rotulo: { fontSize: ESCALA_PDF.micro, color: COLOR.ocreProfundo, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 },
  h1: { fontFamily: FUENTE.display, fontWeight: 700, fontSize: 19, color: COLOR.atlantico, letterSpacing: 1.4 },
  h1Filete: { width: 44, height: 2, backgroundColor: COLOR.ocre, marginTop: 10, marginBottom: 20 },
  p: { fontSize: 10.5, lineHeight: 1.6, color: COLOR.noche, marginBottom: 10, textAlign: "justify" },
  lead: { fontFamily: FUENTE.serif, fontSize: 15, lineHeight: 1.35, color: COLOR.atlantico, marginBottom: 12 },
  saludo: { fontFamily: FUENTE.serif, fontStyle: "italic", fontSize: 22, color: COLOR.atlantico, marginBottom: 14 },

  cita: { marginTop: 14, marginBottom: 6, backgroundColor: COLOR.atlantico, borderTopWidth: 3, borderTopColor: COLOR.ocre, paddingVertical: 18, paddingHorizontal: 28, alignItems: "center" },
  citaTexto: { fontFamily: FUENTE.serif, fontSize: 14, lineHeight: 1.4, color: COLOR.alba, textAlign: "center" },
  citaFuerte: { fontFamily: FUENTE.serif, fontStyle: "italic", fontSize: 16, lineHeight: 1.4, color: COLOR.ocreClaro, textAlign: "center", marginTop: 8 },

  practica: { flexDirection: "row", marginBottom: 9 },
  practicaNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLOR.atlantico, color: COLOR.alba, fontSize: 9, fontWeight: 700, textAlign: "center", paddingTop: 5.5, marginRight: 10 },
  practicaTexto: { flex: 1, fontSize: 10.5, lineHeight: 1.5, paddingTop: 3 },

  nota: { fontSize: ESCALA_PDF.caption, color: COLOR.castano, marginTop: 6 },
  fotoPie: { position: "absolute", left: 0, right: 0, bottom: 46, objectFit: "cover" },

  // Itinerario
  resumen: { flexDirection: "row", gap: 8, marginBottom: 18 },
  resumenCaja: { flex: 1, borderWidth: 1, borderColor: COLOR.piedra, backgroundColor: "#FFFFFF", padding: 10, borderRadius: 3 },
  resumenRotulo: { fontSize: ESCALA_PDF.micro, color: COLOR.ocreProfundo, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 3 },
  resumenDato: { fontSize: 10.5, fontWeight: 700, color: COLOR.noche },
  dia: { flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: "#EFE5D6" },
  chip: { width: 58, backgroundColor: COLOR.atlantico, color: COLOR.alba, fontSize: 8, fontWeight: 700, letterSpacing: 0.8, textAlign: "center", paddingVertical: 4, borderRadius: 2, marginRight: 14 },
  diaEtapa: { width: 52, fontSize: 8, fontWeight: 700, color: COLOR.ocreProfundo, letterSpacing: 1, textTransform: "uppercase" },
  diaTexto: { flex: 1, fontSize: 10.5, color: COLOR.noche },
  diaKm: { width: 50, fontSize: 10, color: COLOR.castano, textAlign: "right" },

  // Alojamiento y acompañamiento
  tarjeta: { flexDirection: "row", backgroundColor: "#FFFFFF", borderLeftWidth: 3, borderLeftColor: COLOR.ocre, marginBottom: 10, alignItems: "center" },
  tarjetaTexto: { flex: 1, padding: 12 },
  tarjetaTitulo: { fontFamily: FUENTE.display, fontWeight: 700, fontSize: 11, color: COLOR.atlantico, letterSpacing: 1, marginBottom: 4 },
  tarjetaCuerpo: { fontSize: 10, lineHeight: 1.45, color: COLOR.noche },
  tarjetaFoto: { width: 92, height: 69, objectFit: "cover", margin: 6 },
  referencia: { fontSize: 6.5, color: COLOR.castano, textAlign: "center", marginBottom: 4 },

  lista: { flexDirection: "row", marginBottom: 6 },
  punto: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLOR.ocre, marginTop: 4.5, marginRight: 9 },

  confirmacion: { marginTop: 14, borderWidth: 1, borderColor: COLOR.atlantico, padding: 14, alignItems: "center" },
  confirmacionTitulo: { fontFamily: FUENTE.display, fontWeight: 700, fontSize: 10, color: COLOR.atlantico, letterSpacing: 1.6, marginBottom: 5 },

  pie: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: COLOR.atlantico, paddingVertical: 14, paddingHorizontal: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pieMarca: { fontFamily: FUENTE.display, fontSize: 8.5, color: COLOR.alba, letterSpacing: 2 },
  pieDato: { fontSize: ESCALA_PDF.micro, color: COLOR.ocreClaro, letterSpacing: 1.2 },

  // Cierre
  cierreTexto: { position: "absolute", top: 250, left: 48, right: 48, alignItems: "center" },
  cierreTitulo: { fontFamily: FUENTE.display, fontWeight: 700, fontSize: 26, color: COLOR.alba, letterSpacing: 2, textAlign: "center" },
  cierreSub: { fontFamily: FUENTE.serif, fontStyle: "italic", fontSize: 18, color: COLOR.ocreClaro, marginTop: 8, textAlign: "center" },
  cierreContacto: { fontSize: 10, color: COLOR.alba, marginTop: 26, textAlign: "center", lineHeight: 1.7 },
  cierreFirma: { fontFamily: FUENTE.serif, fontStyle: "italic", fontSize: 20, color: COLOR.alba, marginTop: 18 },
});

function Interior({ carta, seccion, children, fotoPie }: { carta: CartaBienvenida; seccion: string; children: React.ReactNode; fotoPie?: { src: string; alto: number } }) {
  return (
    <Page size="A4" style={s.pagina}>
      <View style={s.cabecera} fixed>
        <Text style={s.cabeceraMarca}>{CONTACTO.marca.toUpperCase()}</Text>
        <Text style={s.cabeceraSeccion}>{seccion}</Text>
      </View>
      <View style={s.cuerpo}>{children}</View>
      {fotoPie && <Image src={foto(fotoPie.src)} style={[s.fotoPie, { height: fotoPie.alto }]} />}
      <View style={s.pie} fixed>
        <Text style={s.pieMarca}>{CONTACTO.marca.toUpperCase()}</Text>
        <Text style={s.pieDato}>{`${carta.ruta} · ${carta.edicion}`.toUpperCase()}</Text>
      </View>
    </Page>
  );
}

function Titulo({ rotulo, children }: { rotulo?: string; children: string }) {
  return (
    <View>
      {rotulo && <Text style={s.rotulo}>{rotulo}</Text>}
      <Text style={s.h1}>{children.toUpperCase()}</Text>
      <View style={s.h1Filete} />
    </View>
  );
}

function Cita({ texto, fuerte }: { texto: string; fuerte?: string }) {
  return (
    <View style={s.cita} wrap={false}>
      <Text style={s.citaTexto}>{texto}</Text>
      {fuerte && <Text style={s.citaFuerte}>{fuerte}</Text>}
    </View>
  );
}

function Punto({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.lista}>
      <View style={s.punto} />
      <Text style={{ flex: 1, fontSize: 10.5, lineHeight: 1.45 }}>{children}</Text>
    </View>
  );
}

const ALOJAMIENTOS = [
  { titulo: "Albergue privado", texto: "Para conectar con el espíritu peregrino tradicional del Camino.", foto: "albergue.jpg" },
  { titulo: "Pensión / Hotel", texto: "Habitación doble con baño privado para mayor descanso.", foto: "pension.jpg" },
  { titulo: "Pazo / Casa rural", texto: "Casas de piedra gallegas con encanto y tradición.", foto: "pazo.jpg" },
  { titulo: "Hotel superior", texto: "Nuestro alojamiento de celebración en Santiago de Compostela.", foto: "hotel.jpg" },
];

export function CartaBienvenidaPDF({ carta }: { carta: CartaBienvenida }) {
  const d = carta.destinatario;
  const km = carta.km != null ? `${carta.km.toLocaleString("es-CO")} km` : null;
  const saludoCarta = d ? d.saludo : "Querido peregrino, querida peregrina";

  return (
    <Document title={`Bienvenida ${carta.ruta} ${carta.edicion}${d ? ` — ${d.nombre}` : ""}`} author="El Camino con Naty & Nico">
      {/* ── Portada ── */}
      <Page size="A4" style={s.llena}>
        <Image src={foto("portada.jpg")} style={s.fondo} fixed />
        <View style={s.velo} fixed />
        <View style={s.portadaTexto}>
          <Image src={foto("logo-blanco.png")} style={s.logo} />
          <Text style={s.saludoPortada}>{(d ? d.bienvenida : "Bienvenida").toUpperCase()}</Text>
          <Text style={s.tituloPortada}>CAMINO DE SANTIAGO</Text>
          <Text style={s.rutaPortada}>{carta.ruta}</Text>
          <View style={s.filete} />
          {carta.encuentro && <Text style={s.datoPortada}>{`${fechaLarga(carta.encuentro.fecha)} · ${carta.encuentro.lugar}`}</Text>}
          {carta.cierre && <Text style={s.datoPortada}>{`Cierre: ${fechaDiaMes(carta.cierre.fecha)} · ${carta.cierre.lugar}`}</Text>}
          <Text style={s.datoPortada}>
            {[carta.dias ? `${carta.dias} días` : null, carta.etapas ? `${carta.etapas} etapas caminando` : null, km].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={s.banda}>
          <Text style={s.bandaTexto}>EL CAMINO CON NATY & NICO</Text>
        </View>
      </Page>

      {/* ── La carta ── */}
      <Interior carta={carta} seccion="Bienvenida" fotoPie={{ src: "mochilas.jpg", alto: 150 }}>
        <Text style={s.saludo}>{saludoCarta},</Text>
        <Text style={s.lead}>
          Nos alegra que hayas respondido al llamado de este gran sueño compartido: el Camino de Santiago{carta.ruta ? ` — ${carta.ruta}` : ""}. El Camino de la Voluntad Sagrada.
        </Text>
        <Text style={s.p}>
          Gracias por confiar en ti… y por confiar en nosotros para acompañarte. Desde este instante, ya caminamos juntos. Estaremos a tu lado siendo un terreno seguro y amoroso donde puedas ser tú, sin máscaras ni exigencias.
        </Text>
        <Text style={s.p}>El Camino tiene su propia historia, energía y magia; y se abre para quienes llegan con el corazón disponible.</Text>
        <Text style={s.p}>Recuerda: cada quien hace su propio camino, y cada camino es único, irrepetible y profundamente valioso.</Text>
        <Cita texto={"Abre tu corazón y déjate tocar por lo que el Camino tiene reservado para ti.\nLo importante no es solo llegar a Santiago…"} fuerte="sino llegar a ti." />
      </Interior>

      {/* ── Preparación interior ── */}
      <Interior carta={carta} seccion="Preparación interior" fotoPie={{ src: "bosque.jpg", alto: 230 }}>
        <Titulo rotulo="Antes de salir">Preparación interior</Titulo>
        <Text style={s.lead}>Nuestra recomendación más importante es esta: vaciarte.</Text>
        <Text style={s.p}>
          Vaciarte de expectativas, de juicios, de la necesidad de controlarlo todo. No porque no sea válido soñar o imaginar cómo será el Camino, sino porque lo más poderoso que puede suceder es estar disponible para lo que no esperabas.
        </Text>
        <Text style={s.p}>Al vaciarte, te permites llegar como un lienzo en blanco, listo para que cada paso, cada encuentro y cada paisaje pinte en ti una experiencia única.</Text>
        <Text style={s.p}>
          También te invitamos a hacer espacio para lo desconocido. No intentes tener todas las respuestas antes de empezar. Más bien, date el permiso de experimentar el Camino como una pregunta viva, como un diálogo continuo con tu interior.
        </Text>
        <Text style={[s.rotulo, { marginTop: 8, marginBottom: 10 }]}>Algunas prácticas para preparar tu terreno interior</Text>
        {[
          "Haz una pausa diaria: pregúntate ¿cómo me siento ahora? Solo observa, sin intentar cambiar nada.",
          "Anota pensamientos que se repiten. Verlos por escrito te ayuda a tomar conciencia de lo que cargas.",
          "Regálate 10 minutos al día sin estímulos. Sin celular, sin música. Solo contigo. El silencio empieza a afinar la escucha.",
        ].map((t, i) => (
          <View key={i} style={s.practica}>
            <Text style={s.practicaNum}>{i + 1}</Text>
            <Text style={s.practicaTexto}>{t}</Text>
          </View>
        ))}
      </Interior>

      {/* ── Preparación física ── */}
      <Interior carta={carta} seccion="Preparación física" fotoPie={{ src: "flecha.jpg", alto: 250 }}>
        <Titulo rotulo="El cuerpo también camina">Preparación física</Titulo>
        <Text style={s.p}>
          Entrenarte físicamente es importante. Una buena forma de hacerlo es caminar regularmente semanas antes del viaje. Empieza con distancias cortas y aumenta progresivamente hasta cubrir 15–20 km en sesiones prolongadas.
        </Text>
        <Text style={s.p}>
          Sin embargo, más allá de la preparación física, el Camino trabaja en niveles más profundos. No importa cuánto prepares tu cuerpo: siempre traerá los desafíos específicos que necesitas vivir.
        </Text>
        <Text style={s.p}>A veces, un dolor o un cansancio es un llamado a mirar lo que cargas emocionalmente, a soltar creencias o a aprender a escuchar con paciencia y aceptación.</Text>
        <Cita
          texto="Tu verdadera preparación no solo está en caminar o entrenarte físicamente, sino en confiar y abrirte a lo que el Camino tenga para ti."
          fuerte="El Camino te dará exactamente lo que necesitas para crecer y transformarte."
        />
        <Text style={s.nota}>* Profundizaremos este tema en nuestro encuentro virtual grupal previo al viaje.</Text>
      </Interior>

      {/* ── Itinerario ── */}
      <Interior carta={carta} seccion="Itinerario">
        <Titulo rotulo="Día a día">Itinerario y etapas</Titulo>
        <View style={s.resumen}>
          <View style={s.resumenCaja}>
            <Text style={s.resumenRotulo}>Inicio</Text>
            <Text style={s.resumenDato}>{carta.encuentro ? `${fechaDiaMes(carta.encuentro.fecha)} · ${carta.encuentro.lugar}` : "Por confirmar"}</Text>
          </View>
          <View style={s.resumenCaja}>
            <Text style={s.resumenRotulo}>Cierre</Text>
            <Text style={s.resumenDato}>{carta.cierre ? `${fechaDiaMes(carta.cierre.fecha)} · ${carta.cierre.lugar}` : "Por confirmar"}</Text>
          </View>
          <View style={s.resumenCaja}>
            <Text style={s.resumenRotulo}>Total</Text>
            <Text style={s.resumenDato}>{[km, carta.etapas ? `${carta.etapas} etapas` : null].filter(Boolean).join(" · ") || "—"}</Text>
          </View>
        </View>
        {carta.encuentro && carta.llegadaSugerida && (
          <Text style={s.p}>
            Sugerimos que tu llegada a {carta.encuentro.ciudad} sea el {fechaDiaMes(carta.llegadaSugerida)}, ya que nuestro encuentro será el {fechaDiaMes(carta.encuentro.fecha)} en {carta.encuentro.lugar} —{carta.encuentro.hora}—.
            {carta.encuentro.trasladoA ? ` Ese mismo día nos trasladamos a ${carta.encuentro.trasladoA}, desde donde iniciamos el peregrinaje.` : ""}
          </Text>
        )}
        <Text style={[s.rotulo, { marginTop: 10, marginBottom: 6 }]}>Las etapas</Text>
        {carta.itinerario.map((dia) => (
          <View key={dia.fecha} style={s.dia} wrap={false}>
            <Text style={s.chip}>{dia.chip}</Text>
            <Text style={s.diaEtapa}>{dia.etapa ?? ""}</Text>
            <Text style={s.diaTexto}>{dia.texto}</Text>
            <Text style={s.diaKm}>{dia.km ? `${dia.km.toLocaleString("es-CO")} km` : ""}</Text>
          </View>
        ))}
      </Interior>

      {/* ── Alojamiento ── */}
      <Interior carta={carta} seccion="Alojamiento">
        <Titulo rotulo="Dónde descansamos">Alojamiento</Titulo>
        <Text style={s.p}>Tendremos cuatro tipos de alojamiento cuidadosamente seleccionados para combinar comodidad, descanso y la auténtica experiencia peregrina:</Text>
        {ALOJAMIENTOS.map((a) => (
          <View key={a.titulo} style={s.tarjeta} wrap={false}>
            <View style={s.tarjetaTexto}>
              <Text style={s.tarjetaTitulo}>{a.titulo.toUpperCase()}</Text>
              <Text style={s.tarjetaCuerpo}>{a.texto}</Text>
            </View>
            <View>
              <Image src={foto(a.foto)} style={s.tarjetaFoto} />
              <Text style={s.referencia}>Imagen de referencia</Text>
            </View>
          </View>
        ))}
        <Text style={s.nota}>Los alojamientos están sujetos a disponibilidad. Recibirás las reservas 20 días antes del viaje.</Text>
      </Interior>

      {/* ── Acompañamiento ── */}
      <Interior carta={carta} seccion="Acompañamiento">
        <Titulo rotulo="No caminas sola ni solo">Acompañamiento</Titulo>
        <Text style={s.p}>Te acompañaremos y apoyaremos desde el momento en que reservas tu viaje, para resolver dudas y brindarte información importante. Además, contarás con:</Text>
        {[
          { t: "Encuentro grupal virtual", c: "Mes y medio antes del viaje, para resolver dudas sobre equipaje, preparación física, calzado y todo lo que necesites saber." },
          { t: "Sesión individual virtual con Nati", c: "Un espacio de conexión para conocer en qué momento de vida te encuentras y establecer la intención de tu Camino, disponerte en cuerpo y alma." },
          { t: "Acompañamiento diario durante el Camino", c: "Espacios de meditación, conversatorios y herramientas de autoconocimiento integradas en cada jornada de caminata." },
          carta.ritual
            ? { t: `Ritual de cierre en ${carta.ritual.lugar}`, c: `${fechaDiaMes(carta.ritual.fecha).replace(/^./, (x) => x.toUpperCase())}: espacio especial de celebración y cierre en el mar, terminando con la puesta de sol en el Faro de ${carta.ritual.lugar}.` }
            : { t: "Círculo de cierre", c: "Un espacio especial de celebración y cierre del Camino, todos juntos." },
        ].map((x) => (
          <View key={x.t} style={s.tarjeta} wrap={false}>
            <View style={s.tarjetaTexto}>
              <Text style={s.tarjetaTitulo}>{x.t.toUpperCase()}</Text>
              <Text style={s.tarjetaCuerpo}>{x.c}</Text>
            </View>
          </View>
        ))}
        <Cita texto={"¡Lo que necesites, aquí estamos!\nGracias por unirte, por ser parte y por sumar."} fuerte="La experiencia la creamos entre todos. Juntos es mejor." />
      </Interior>

      {/* ── Documentos ── */}
      <Interior carta={carta} seccion="Documentos" fotoPie={{ src: "caminantes.jpg", alto: 230 }}>
        <Titulo rotulo="Para tener a mano">Documentos importantes</Titulo>
        <Text style={s.p}>20 días antes del viaje recibirás por correo electrónico o WhatsApp la documentación necesaria:</Text>
        <Punto>Seguro de viaje.</Punto>
        <Punto>Reservas de hoteles y alojamientos.</Punto>
        <Punto>Detalles finales del itinerario.</Punto>
        <Text style={[s.p, { marginTop: 8 }]}>En el formulario de registro te pedimos una foto de tu pasaporte para las reservas.</Text>
        <Cita texto="Es importante que verifiques las fechas y la vigencia de tu pasaporte." fuerte="No puedes viajar con menos de 6 meses de vigencia antes de la fecha de vencimiento." />
        <View style={s.confirmacion} wrap={false}>
          <Text style={s.confirmacionTitulo}>CONFIRMACIÓN DEL VIAJE</Text>
          <Text style={{ fontSize: 9.5, color: COLOR.noche, textAlign: "center", lineHeight: 1.5 }}>
            El viaje se confirma con el número mínimo de personas inscritas. En caso de no lograrlo, realizaremos la devolución de tu dinero.
          </Text>
        </View>
      </Interior>

      {/* ── Contraportada ── */}
      <Page size="A4" style={s.llena}>
        <Image src={foto("cierre.jpg")} style={s.fondo} fixed />
        <View style={s.velo} fixed />
        <View style={s.cierreTexto}>
          <Image src={foto("logo-blanco.png")} style={{ width: 110, marginBottom: 30 }} />
          <Text style={s.cierreTitulo}>{d ? `¡NOS VEMOS PRONTO, ${d.nombre.toUpperCase()}!` : "¡NOS VEMOS PRONTO, PEREGRINOS!"}</Text>
          <Text style={s.cierreSub}>{`${carta.ruta} · ${carta.edicion}`}</Text>
          <View style={s.filete} />
          <Text style={s.cierreContacto}>{`¿Preguntas? Escríbenos — estamos para acompañarte.\n${CONTACTO.whatsapp} · ${CONTACTO.correo}`}</Text>
          <Text style={s.cierreFirma}>Nati & Nico</Text>
        </View>
        <View style={s.banda}>
          <Text style={s.bandaTexto}>EL CAMINO CON NATY & NICO</Text>
        </View>
      </Page>
    </Document>
  );
}
