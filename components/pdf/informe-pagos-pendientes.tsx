import { base, Document, Membrete, Page, Pie, StyleSheet, Text, View, TRAMA, TONO } from "./brand-shell";
import { COLOR, ESCALA_PDF, FUENTE } from "@/lib/brand";
import type { InformePagos, Giro } from "@/lib/pagos-pendientes/datos";

/**
 * El informe para sentarse a girar: una fila por pago, agrupado por medio, y los datos
 * bancarios completos al lado de cada importe. Lo que falta para poder pagar va marcado
 * en rojo en la propia fila, no en una nota al final.
 */

const col = StyleSheet.create({
  prov: { flex: 1.6, paddingRight: 4 },
  serv: { flex: 1.4, paddingRight: 4 },
  concepto: { flex: 1.1, paddingRight: 4 },
  vence: { flex: 0.8 },
  monto: { flex: 0.9, textAlign: "right", paddingRight: 6 },
  cop: { flex: 1, textAlign: "right", paddingRight: 6 },
  datos: { flex: 3, paddingRight: 4 },
  origen: { flex: 0.9 },
});

const s = StyleSheet.create({
  page: { ...base.page, padding: 36, fontSize: ESCALA_PDF.caption },
  kpis: { flexDirection: "row", gap: 10, marginBottom: 14 },
  kpi: { flex: 1, borderWidth: 1, borderColor: TRAMA.borde, borderRadius: 4, padding: 10 },
  kpiLabel: { fontSize: ESCALA_PDF.micro, color: COLOR.castano, textTransform: "uppercase", letterSpacing: 1 },
  kpiValue: { fontSize: 15, fontFamily: FUENTE.display, fontWeight: 700, color: COLOR.atlantico, marginTop: 4 },
  row: { ...base.tableRow, fontSize: 7.5 },
  head: { ...base.tableHead, fontSize: 6.5 },
  foot: { ...base.tableFoot, fontSize: 7.5 },
  dato: { fontSize: 7.2, color: COLOR.noche },
  rojo: { color: "#8B3A2F", fontFamily: FUENTE.body, fontWeight: 700 },
  muted: { color: COLOR.castano },
  grupo: { marginTop: 12, marginBottom: 4 },
});

const fmt = {
  eur: (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "EUR" }).format(n),
  cop: (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n),
  fecha: (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) : "—"),
};

/** Los datos que hay que copiar al banco para este giro, cada uno en su renglón. */
function DatosDePago({ g }: { g: Giro }) {
  const lineas: string[] = [];
  if (g.medio === "transferencia") {
    if (g.titular) lineas.push(`Titular: ${g.titular}`);
    if (g.iban) lineas.push(`IBAN: ${g.iban}`);
    if (g.swift) lineas.push(`SWIFT: ${g.swift}`);
    if (g.banco) lineas.push(`Banco: ${g.banco}`);
  } else if (g.medio === "bizum") {
    if (g.bizum) lineas.push(`Bizum: ${g.bizum}`);
    if (g.titular) lineas.push(`A nombre de: ${g.titular}`);
  } else if (g.medio === "booking") {
    lineas.push("Se paga por la plataforma (Booking)");
  } else if (g.medio === "tarjeta") {
    lineas.push("Con tarjeta");
  } else if (g.medio === "efectivo") {
    lineas.push("En efectivo, al llegar");
  }
  if (g.monto_moneda != null) lineas.push(`Se gira ${g.monto_moneda.toFixed(2)} ${g.moneda}`);
  if (g.referencia) lineas.push(`Concepto: ${g.referencia}`);
  if (g.condicion) lineas.push(`Pactado: ${g.condicion}`);
  if (g.notas) lineas.push(g.notas);
  return (
    <View style={col.datos}>
      {lineas.map((l, i) => <Text key={i} style={s.dato}>{l}</Text>)}
      {g.faltan.length > 0 && <Text style={{ ...s.dato, ...s.rojo }}>Falta: {g.faltan.join(", ")}</Text>}
      {lineas.length === 0 && g.faltan.length === 0 && <Text style={s.muted}>—</Text>}
    </View>
  );
}

function Tabla({ titulo, giros, trm }: { titulo: string; giros: Giro[]; trm: number | null }) {
  if (giros.length === 0) return null;
  const total = giros.reduce((x, g) => x + g.monto_eur, 0);
  return (
    <View>
      <Text style={{ ...base.sectionTitle, ...s.grupo }}>
        {titulo} — {giros.length} pago{giros.length > 1 ? "s" : ""} · {fmt.eur(total)}
      </Text>
      <View style={base.table}>
        <View style={s.head}>
          <Text style={col.prov}>Proveedor</Text>
          <Text style={col.serv}>Servicio</Text>
          <Text style={col.concepto}>Concepto</Text>
          <Text style={col.vence}>Vence</Text>
          <Text style={col.monto}>Importe</Text>
          <Text style={col.cop}>En COP</Text>
          <Text style={col.datos}>Datos para pagar</Text>
          <Text style={col.origen}>Sale de</Text>
        </View>
        {giros.map((g, i) => (
          <View key={`${g.reservation_id}-${i}`} style={s.row} wrap={false}>
            <Text style={col.prov}>{g.proveedor}{g.camino ? `\n${g.camino}` : ""}</Text>
            <Text style={col.serv}>{g.servicio}</Text>
            <Text style={col.concepto}>{g.concepto}</Text>
            <Text style={g.vencida ? { ...col.vence, ...s.rojo } : col.vence}>
              {fmt.fecha(g.vence)}{g.vencida ? "\nvencida" : ""}
            </Text>
            <Text style={{ ...col.monto, fontFamily: FUENTE.body, fontWeight: 700 }}>{fmt.eur(g.monto_eur)}</Text>
            <Text style={col.cop}>{trm ? fmt.cop(g.monto_eur * trm) : "-"}</Text>
            <DatosDePago g={g} />
            <Text style={col.origen}>{g.cuenta_origen ?? "-"}</Text>
          </View>
        ))}
        <View style={s.foot}>
          <Text style={col.prov}>Total {titulo.toLowerCase()}</Text>
          <Text style={col.serv}></Text>
          <Text style={col.concepto}></Text>
          <Text style={col.vence}></Text>
          <Text style={col.monto}>{fmt.eur(total)}</Text>
          <Text style={col.cop}>{trm ? fmt.cop(total * trm) : "-"}</Text>
          <Text style={col.datos}></Text>
          <Text style={col.origen}></Text>
        </View>
      </View>
    </View>
  );
}

export function InformePagosPDF({ data }: { data: InformePagos }) {
  const t = data.totales;
  const transferencias = data.giros.filter((g) => g.medio === "transferencia");
  const bizums = data.giros.filter((g) => g.medio === "bizum");
  const resto = data.giros.filter((g) => g.medio !== "transferencia" && g.medio !== "bizum");

  return (
    <Document title={`Pagos a proveedores · ${data.titulo}`} author="El Camino con Naty">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Membrete />
        <Text style={base.title}>Pagos a proveedores</Text>
        <Text style={base.subtitle}>
          {data.titulo}{data.fechas ? ` · ${data.fechas}` : ""} · generado el {data.generado}
          {data.trm ? ` · TRM de referencia ${new Intl.NumberFormat("es-CO").format(data.trm)} COP/EUR` : ""}
        </Text>

        <View style={s.kpis}>
          <View style={{ ...s.kpi, backgroundColor: TONO.alerta.fondo }}>
            <Text style={s.kpiLabel}>Falta por pagar</Text>
            <Text style={{ ...s.kpiValue, color: TONO.alerta.texto }}>{fmt.eur(t.saldo_eur)}</Text>
            {t.saldo_cop != null && <Text style={s.muted}>{fmt.cop(t.saldo_cop)}</Text>}
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Pagos por hacer</Text>
            <Text style={s.kpiValue}>{data.giros.length}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Ya vencido</Text>
            <Text style={{ ...s.kpiValue, color: t.vencido_eur > 0 ? "#8B3A2F" : COLOR.atlantico }}>{fmt.eur(t.vencido_eur)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Frenado por datos faltantes</Text>
            <Text style={{ ...s.kpiValue, color: t.bloqueado_eur > 0 ? "#8B3A2F" : COLOR.atlantico }}>{fmt.eur(t.bloqueado_eur)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Ya pagado</Text>
            <Text style={{ ...s.kpiValue, color: TONO.ok.texto }}>{fmt.eur(t.pagado_eur)}</Text>
          </View>
        </View>

        {data.giros.length === 0 && (
          <Text style={{ marginTop: 10 }}>No hay pagos pendientes a proveedores. Todo girado.</Text>
        )}

        <Tabla titulo="Transferencias" giros={transferencias} trm={data.trm} />
        <Tabla titulo="Bizum" giros={bizums} trm={data.trm} />
        <Tabla titulo="Otros medios y sin definir" giros={resto} trm={data.trm} />

        {data.otros.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={base.sectionTitle}>Otros del presupuesto (viáticos, tiquetes, materiales)</Text>
            <View style={base.table}>
              <View style={s.head}>
                <Text style={{ flex: 3 }}>Ítem</Text>
                <Text style={{ flex: 1.2 }}>Categoría</Text>
                <Text style={{ flex: 0.9, textAlign: "right", paddingRight: 6 }}>Total</Text>
                <Text style={{ flex: 0.9, textAlign: "right", paddingRight: 6 }}>Pagado</Text>
                <Text style={{ flex: 0.9, textAlign: "right", paddingRight: 6 }}>Saldo</Text>
              </View>
              {data.otros.map((o, i) => (
                <View key={i} style={s.row}>
                  <Text style={{ flex: 3 }}>{o.descripcion.replace(/→/g, "-")}</Text>
                  <Text style={{ flex: 1.2 }}>{o.categoria}</Text>
                  <Text style={{ flex: 0.9, textAlign: "right", paddingRight: 6 }}>{fmt.eur(o.total_eur)}</Text>
                  <Text style={{ flex: 0.9, textAlign: "right", paddingRight: 6 }}>{o.pagado_eur > 0 ? fmt.eur(o.pagado_eur) : "-"}</Text>
                  <Text style={{ flex: 0.9, textAlign: "right", paddingRight: 6, fontFamily: FUENTE.body, fontWeight: 700 }}>{fmt.eur(o.saldo_eur)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {data.avisos.length > 0 && (
          <View style={base.noteBox} wrap={false}>
            <Text style={base.noteTitle}>Revisar</Text>
            {data.avisos.map((a, i) => <Text key={i}>{a}</Text>)}
          </View>
        )}

        <Pie nota={`El Camino con Naty · Pagos a proveedores · ${data.titulo} · Los importes en COP son de referencia a la TRM indicada.`} />
      </Page>
    </Document>
  );
}
