import { base, Document, Membrete, Page, Pie, StyleSheet, Text, View, TRAMA, TONO } from "./brand-shell";
import { COLOR, ESCALA_PDF, FUENTE } from "@/lib/brand";
import type { InformePagos } from "@/lib/pagos-pendientes/datos";

/** Anchos de la tabla. A4 apaisado: caben los datos de pago sin apretar. */
const col = StyleSheet.create({
  prov: { flex: 1.5, paddingRight: 4 },
  serv: { flex: 1.3, paddingRight: 4 },
  fecha: { flex: 0.7 },
  total: { flex: 0.8, textAlign: "right", paddingRight: 6 },
  pagado: { flex: 0.8, textAlign: "right", paddingRight: 6 },
  saldo: { flex: 0.9, textAlign: "right", paddingRight: 6 },
  cop: { flex: 1, textAlign: "right", paddingRight: 6 },
  medio: { flex: 0.9 },
  cuenta: { flex: 1 },
  datos: { flex: 2.2, paddingRight: 4 },
  cuota: { flex: 1 },
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
  vencida: { color: "#8B3A2F", fontFamily: FUENTE.body, fontWeight: 700 },
  muted: { color: COLOR.castano },
});

const fmt = {
  eur: (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "EUR" }).format(n),
  cop: (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n),
  fecha: (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) : "—"),
};

export function InformePagosPDF({ data }: { data: InformePagos }) {
  const t = data.totales;
  return (
    <Document title={`Pagos pendientes · ${data.camino}`} author="El Camino con Naty">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Membrete />
        <Text style={base.title}>Pagos pendientes a proveedores</Text>
        <Text style={base.subtitle}>
          {data.camino} · {data.fechas} · generado el {data.generado}
          {data.trm ? ` · TRM de referencia ${new Intl.NumberFormat("es-CO").format(data.trm)} COP/EUR` : ""}
        </Text>

        <View style={s.kpis}>
          <View style={s.kpi}><Text style={s.kpiLabel}>Pactado con proveedores</Text><Text style={s.kpiValue}>{fmt.eur(t.total_eur)}</Text></View>
          <View style={s.kpi}><Text style={s.kpiLabel}>Pagado</Text><Text style={{ ...s.kpiValue, color: TONO.ok.texto }}>{fmt.eur(t.pagado_eur)}</Text></View>
          <View style={{ ...s.kpi, backgroundColor: TONO.alerta.fondo }}><Text style={s.kpiLabel}>Falta por pagar (reservas + otros)</Text><Text style={{ ...s.kpiValue, color: TONO.alerta.texto }}>{fmt.eur(t.saldo_eur)}</Text>{t.saldo_cop != null && <Text style={s.muted}>{fmt.cop(t.saldo_cop)}</Text>}</View>
          <View style={s.kpi}><Text style={s.kpiLabel}>Cuotas vencidas</Text><Text style={{ ...s.kpiValue, color: t.vencido_eur > 0 ? "#8B3A2F" : COLOR.atlantico }}>{fmt.eur(t.vencido_eur)}</Text></View>
        </View>

        <View style={base.table}>
          <View style={s.head} fixed>
            <Text style={col.prov}>Proveedor</Text>
            <Text style={col.serv}>Servicio</Text>
            <Text style={col.fecha}>Fecha</Text>
            <Text style={col.total}>Total</Text>
            <Text style={col.pagado}>Pagado</Text>
            <Text style={col.saldo}>Saldo</Text>
            <Text style={col.cop}>Saldo COP</Text>
            <Text style={col.medio}>Medio</Text>
            <Text style={col.cuenta}>Desde</Text>
            <Text style={col.datos}>Datos de pago</Text>
            <Text style={col.cuota}>Próxima cuota</Text>
          </View>
          {data.filas.length === 0 && (
            <View style={s.row}><Text>No hay reservas con saldo pendiente. Todo pagado.</Text></View>
          )}
          {data.filas.map((f) => (
            <View key={f.reservation_id} style={s.row} wrap={false}>
              <Text style={col.prov}>{f.proveedor}</Text>
              <Text style={col.serv}>{f.servicio}{f.estado ? `\n${f.estado}` : ""}</Text>
              <Text style={col.fecha}>{fmt.fecha(f.fecha)}</Text>
              <Text style={col.total}>{fmt.eur(f.total_eur)}</Text>
              <Text style={col.pagado}>{f.pagado_eur > 0 ? fmt.eur(f.pagado_eur) : "-"}</Text>
              <Text style={{ ...col.saldo, fontFamily: FUENTE.body, fontWeight: 700 }}>{fmt.eur(f.saldo_eur)}</Text>
              <Text style={col.cop}>{data.trm ? fmt.cop(f.saldo_eur * data.trm) : "-"}</Text>
              <Text style={col.medio}>{f.medio_label}</Text>
              <Text style={col.cuenta}>{f.cuenta_origen ?? "-"}</Text>
              <View style={col.datos}>
                {f.datos_pago.length === 0 ? <Text style={{ ...s.dato, color: "#8B3A2F" }}>Completar en el proveedor</Text> : f.datos_pago.map((d, i) => <Text key={i} style={s.dato}>{d}</Text>)}
              </View>
              <View style={col.cuota}>
                {f.cuotas.length === 0 ? (
                  <Text style={s.muted}>Sin plan</Text>
                ) : (
                  f.cuotas.slice(0, 3).map((c, i) => (
                    <Text key={i} style={c.vencida ? s.vencida : undefined}>
                      {fmt.fecha(c.fecha)} · {fmt.eur(c.monto_eur)}{c.label ? ` · ${c.label}` : ""}{c.vencida ? " · vencida" : ""}
                    </Text>
                  ))
                )}
              </View>
            </View>
          ))}
          <View style={s.foot}>
            <Text style={col.prov}>Total</Text>
            <Text style={col.serv}></Text>
            <Text style={col.fecha}></Text>
            <Text style={col.total}>{fmt.eur(t.total_eur)}</Text>
            <Text style={col.pagado}>{fmt.eur(t.pagado_eur)}</Text>
            <Text style={col.saldo}>{fmt.eur(data.filas.reduce((x, f) => x + f.saldo_eur, 0))}</Text>
            <Text style={col.cop}>{data.trm ? fmt.cop(data.filas.reduce((x, f) => x + f.saldo_eur, 0) * data.trm) : "-"}</Text>
            <Text style={col.medio}></Text>
            <Text style={col.cuenta}></Text>
            <Text style={col.datos}></Text>
            <Text style={col.cuota}></Text>
          </View>
        </View>

        {data.otros.length > 0 && (
          <View style={{ marginTop: 10 }}>
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
                  <Text style={{ flex: 3 }}>{o.descripcion.replace(/\u2192/g, "-")}</Text>
                  <Text style={{ flex: 1.2 }}>{o.categoria}</Text>
                  <Text style={{ flex: 0.9, textAlign: "right", paddingRight: 6 }}>{fmt.eur(o.total_eur)}</Text>
                  <Text style={{ flex: 0.9, textAlign: "right", paddingRight: 6 }}>{o.pagado_eur > 0 ? fmt.eur(o.pagado_eur) : "-"}</Text>
                  <Text style={{ flex: 0.9, textAlign: "right", paddingRight: 6, fontFamily: FUENTE.body, fontWeight: 700 }}>{fmt.eur(o.saldo_eur)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {data.sinDatos.length > 0 && (
          <View style={base.noteBox} wrap={false}>
            <Text style={base.noteTitle}>Faltan datos de pago</Text>
            <Text>{data.sinDatos.join(", ")}: cargá banco, IBAN o Bizum en la ficha del proveedor para que salgan acá.</Text>
          </View>
        )}

        <Pie nota={`El Camino con Naty · Pagos pendientes de ${data.camino} · Los saldos en COP son de referencia a la TRM indicada.`} />
      </Page>
    </Document>
  );
}
