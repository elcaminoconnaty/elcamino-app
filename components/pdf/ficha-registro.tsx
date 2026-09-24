import { COLOR, CONTACTO, ESCALA_PDF, ESTADO, FUENTE } from "@/lib/brand";
import { Document, Image, Page, StyleSheet, Text, View } from "./brand-shell";
import type { FilaRegistro } from "@/lib/registro/datos-equipo";

/**
 * La ficha de registro de un peregrino: todo lo que llenó en el formulario, en una hoja,
 * con la foto del pasaporte y lo que hay que revisar de él. Es interna (para el equipo), así
 * que va con la papelería de la plataforma pero sin fotos de paisaje.
 */

const s = StyleSheet.create({
  pagina: { paddingTop: 0, paddingBottom: 56, fontSize: ESCALA_PDF.body, fontFamily: FUENTE.body, color: COLOR.noche, backgroundColor: COLOR.alba },
  cabecera: { backgroundColor: COLOR.atlantico, paddingVertical: 16, paddingHorizontal: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  cabeceraMarca: { fontFamily: FUENTE.display, fontSize: 10, color: COLOR.alba, letterSpacing: 2.2 },
  cabeceraSeccion: { fontSize: ESCALA_PDF.micro, color: COLOR.ocreClaro, letterSpacing: 2, textTransform: "uppercase" },
  cuerpo: { paddingHorizontal: 40 },
  nombre: { fontFamily: FUENTE.display, fontWeight: 700, fontSize: 18, color: COLOR.atlantico, letterSpacing: 1 },
  sub: { fontSize: ESCALA_PDF.caption, color: COLOR.castano, marginTop: 4, marginBottom: 16 },
  seccion: { fontSize: ESCALA_PDF.micro, fontWeight: 700, color: COLOR.ocreProfundo, letterSpacing: 1.6, textTransform: "uppercase", marginTop: 12, marginBottom: 6, borderBottomWidth: 0.5, borderBottomColor: COLOR.piedra, paddingBottom: 4 },
  grilla: { flexDirection: "row", flexWrap: "wrap" },
  campo: { width: "50%", marginBottom: 7, paddingRight: 10 },
  rotulo: { fontSize: ESCALA_PDF.micro, color: COLOR.castano, textTransform: "uppercase", letterSpacing: 1, marginBottom: 1.5 },
  valor: { fontSize: 10, color: COLOR.noche },
  aviso: { fontSize: 9, marginBottom: 3 },
  fotoPasaporte: { marginTop: 8, maxHeight: 260, objectFit: "contain" },
  nota: { fontSize: ESCALA_PDF.caption, color: COLOR.castano, marginTop: 6 },
  pie: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: COLOR.atlantico, paddingVertical: 12, paddingHorizontal: 40, flexDirection: "row", justifyContent: "space-between" },
  pieTexto: { fontSize: ESCALA_PDF.micro, color: COLOR.ocreClaro, letterSpacing: 1.2 },
});

const f = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

function Campo({ rotulo, valor, ancho }: { rotulo: string; valor: string | number | null | undefined; ancho?: string }) {
  return (
    <View style={[s.campo, ancho ? { width: ancho } : {}]}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={s.valor}>{valor === null || valor === undefined || valor === "" ? "—" : String(valor)}</Text>
    </View>
  );
}

export function FichaRegistroPDF({ camino, fila, foto }: { camino: string; fila: FilaRegistro; foto: { src: Buffer; nota: null } | { src: null; nota: string } }) {
  return (
    <Document title={`Registro ${fila.nombre} — ${camino}`} author={CONTACTO.marca}>
      <Page size="A4" style={s.pagina}>
        <View style={s.cabecera} fixed>
          <Text style={s.cabeceraMarca}>{CONTACTO.marca.toUpperCase()}</Text>
          <Text style={s.cabeceraSeccion}>Ficha de registro</Text>
        </View>
        <View style={s.cuerpo}>
          <Text style={s.nombre}>{fila.nombre}</Text>
          <Text style={s.sub}>
            {camino}
            {fila.formularioLleno ? ` · formulario enviado el ${f(fila.formularioLleno)}` : " · todavía no ha llenado el formulario"}
          </Text>

          <Text style={s.seccion}>Datos personales</Text>
          <View style={s.grilla}>
            <Campo rotulo="Apodo" valor={fila.apodo} />
            <Campo rotulo="Nacimiento" valor={fila.nacimiento ? `${f(fila.nacimiento)}${fila.edad != null ? ` (${fila.edad} años al caminar)` : ""}` : null} />
            <Campo rotulo="Correo" valor={fila.correo} />
            <Campo rotulo="Celular" valor={fila.celular} />
            <Campo rotulo="Dirección" valor={fila.direccion} ancho="100%" />
            <Campo rotulo="Instagram" valor={fila.instagram ? `@${fila.instagram}` : null} />
            <Campo rotulo="Nacionalidad" valor={fila.nacionalidad} />
          </View>

          <Text style={s.seccion}>Contacto de emergencia</Text>
          <View style={s.grilla}>
            <Campo rotulo="Nombre" valor={fila.emergenciaNombre} />
            <Campo rotulo="Parentesco" valor={fila.emergenciaParentesco} />
            <Campo rotulo="Celular" valor={fila.emergenciaCelular} />
          </View>

          <Text style={s.seccion}>Kit y alimentación</Text>
          <View style={s.grilla}>
            <Campo rotulo="Talla de camiseta" valor={fila.camiseta} />
            <Campo rotulo="Talla de sandalias" valor={fila.sandalia} />
            <Campo rotulo="Restricciones de alimentos" valor={fila.alimentacion} ancho="100%" />
          </View>

          <Text style={s.seccion}>Pasaporte</Text>
          <View style={s.grilla}>
            <Campo rotulo="Número" valor={fila.pasaporte} />
            <Campo rotulo="Vence" valor={fila.pasaporteVence ? f(fila.pasaporteVence) : null} />
          </View>
          {fila.avisos.map((a) => (
            <Text key={a.texto} style={[s.aviso, { color: a.nivel === "ok" ? COLOR.musgo : a.nivel === "error" ? ESTADO.error : COLOR.ocreProfundo }]}>
              {/* Sin "✓": la DM Sans del PDF no lo trae. */}
              {a.nivel === "ok" ? "Verificado · " : a.nivel === "error" ? "Corregir · " : "Revisar · "}
              {a.texto}
            </Text>
          ))}
          {foto.src ? <Image src={foto.src} style={s.fotoPasaporte} /> : <Text style={s.nota}>{foto.nota}</Text>}
        </View>
        <View style={s.pie} fixed>
          <Text style={s.pieTexto}>USO INTERNO · DATOS PERSONALES</Text>
          <Text style={s.pieTexto}>{camino.toUpperCase()}</Text>
        </View>
      </Page>
    </Document>
  );
}
