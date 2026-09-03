import { Page, Document, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10.5, fontFamily: "Helvetica", color: "#1a1a1a", backgroundColor: "#fdfaf3" },
  brandBar: { height: 4, width: 60, backgroundColor: "#f5c518", marginBottom: 24 },
  brand: { fontSize: 22, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, marginBottom: 4 },
  brandSub: { fontSize: 10, color: "#6b6b6b", marginBottom: 32 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#6b6b6b", marginBottom: 20 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 9, color: "#6b6b6b", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  rowLabel: { color: "#6b6b6b" },
  rowValue: { fontFamily: "Helvetica-Bold" },
  table: { borderWidth: 0.5, borderColor: "#e6dcc2", borderRadius: 3, marginVertical: 8 },
  tableHead: { flexDirection: "row", backgroundColor: "#faf3e3", padding: 6, fontSize: 8.5, color: "#6b6b6b", textTransform: "uppercase", letterSpacing: 0.8, borderBottomWidth: 0.5, borderBottomColor: "#e6dcc2" },
  tableRow: { flexDirection: "row", padding: 6, borderBottomWidth: 0.5, borderBottomColor: "#f0e7cf", fontSize: 9.5 },
  col1: { flex: 1.2, paddingRight: 4 },
  col2: { flex: 1.1, textAlign: "right", paddingRight: 6 },
  col3: { flex: 0.9, textAlign: "right", paddingRight: 6 },
  col4: { flex: 1.1, textAlign: "right", paddingRight: 8 },
  col5: { flex: 1.2, textAlign: "left" },
  bigAmount: { fontSize: 24, fontFamily: "Helvetica-Bold", marginTop: 8 },
  yellowBox: { backgroundColor: "#fef3c7", padding: 12, borderRadius: 4, fontSize: 9.5, color: "#7c5e10", marginTop: 16 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, fontSize: 8, color: "#9a9a9a", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#e6dcc2", paddingTop: 8 },
});

type ReporteData = {
  registration_id: string;
  pilgrim_name: string;
  pilgrim_email: string | null;
  departure_name: string;
  departure_start_date: string | null;
  total_eur: number;
  paid_eur: number;
  pending_eur: number;
  pending_cop_reference: number | null;
  settlement_trm: number | null;
  settlement_date: string | null;
  /** "recalculo" | "sin_recalculo": si el camino re-valora los abonos en pesos. */
  settlement_mode: string;
  paid_eur_cierre: number;
  saldo_final_eur: number | null;
  saldo_final_cop: number | null;
  paid_in_cop_originally: boolean;
  current_trm: number | null;
  payments: Array<{
    paid_at: string;
    amount: number;
    currency: string;
    trm_eur_cop: number | null;
    amount_eur: number | null;
    amount_eur_cierre: number | null;
    se_revalora: boolean;
    method: string | null;
    kind: string;
  }>;
};

const fmt = {
  date(d: string | null) {
    if (!d) return "—";
    return new Date(d + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  },
  eur(n: number | null | undefined) {
    if (n == null) return "—";
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "EUR" }).format(Number(n));
  },
  cop(n: number | null | undefined) {
    if (n == null) return "—";
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n));
  },
  num(n: number | null | undefined) {
    if (n == null) return "—";
    return new Intl.NumberFormat("es-CO").format(Number(n));
  },
};

export function ReporteSaldoPDF({ data }: { data: ReporteData }) {
  const conRecalculo = data.settlement_mode !== "sin_recalculo";
  const hayCierre = conRecalculo && data.settlement_trm != null && Number(data.settlement_trm) > 0;
  const saldo = data.saldo_final_eur != null ? Number(data.saldo_final_eur) : Number(data.pending_eur);
  return (
    <Document title={`Saldo ${data.pilgrim_name}`} author="El Camino con Naty">
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} />
        <Text style={styles.brand}>El Camino con Naty</Text>
        <Text style={styles.brandSub}>elcaminoconnaty.com</Text>

        <Text style={styles.title}>Reporte de saldo</Text>
        <Text style={styles.subtitle}>Generado el {fmt.date(new Date().toISOString().slice(0, 10))}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Peregrino</Text>
          <View style={styles.row}><Text style={styles.rowLabel}>Nombre</Text><Text style={styles.rowValue}>{data.pilgrim_name}</Text></View>
          {data.pilgrim_email && <View style={styles.row}><Text style={styles.rowLabel}>Email</Text><Text>{data.pilgrim_email}</Text></View>}
          <View style={styles.row}><Text style={styles.rowLabel}>Camino</Text><Text>{data.departure_name}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historial de pagos</Text>
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={styles.col1}>Fecha</Text>
              <Text style={styles.col2}>Monto orig.</Text>
              <Text style={styles.col3}>Tasa del día</Text>
              <Text style={styles.col4}>Equiv. EUR</Text>
              {hayCierre && <Text style={styles.col4}>A tasa cierre</Text>}
              <Text style={styles.col5}>Método pago</Text>
            </View>
            {data.payments.length === 0 ? (
              <View style={styles.tableRow}><Text>Sin pagos registrados.</Text></View>
            ) : (
              data.payments.map((p, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={styles.col1}>{fmt.date(p.paid_at)}</Text>
                  <Text style={styles.col2}>
                    {fmt.num(p.amount)} {p.currency}
                    {p.kind === "devolucion" ? " (dev.)" : p.kind === "cierre" ? " (cierre)" : ""}
                  </Text>
                  <Text style={styles.col3}>{p.trm_eur_cop ? fmt.num(p.trm_eur_cop) : "—"}</Text>
                  <Text style={styles.col4}>{fmt.eur(p.amount_eur)}</Text>
                  {hayCierre && (
                    <Text style={styles.col4}>{p.se_revalora ? fmt.eur(p.amount_eur_cierre) : "="}</Text>
                  )}
                  <Text style={styles.col5}>{p.method ?? "—"}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen</Text>
          <View style={styles.row}><Text style={styles.rowLabel}>Total acordado</Text><Text>{fmt.eur(data.total_eur)}</Text></View>
          {hayCierre ? (
            <>
              <View style={styles.row}><Text style={styles.rowLabel}>Total abonado, a la tasa de cierre</Text><Text>{fmt.eur(data.paid_eur_cierre)}</Text></View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{saldo < -0.5 ? "Saldo a tu favor" : "Saldo pendiente"}</Text>
                <Text style={styles.rowValue}>{fmt.eur(Math.abs(saldo) <= 0.5 ? 0 : Math.abs(saldo))}</Text>
              </View>
              {data.saldo_final_cop != null && Math.abs(saldo) > 0.5 && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{saldo < 0 ? "A devolverte en pesos" : "Saldo pendiente en pesos"}</Text>
                  <Text>{fmt.cop(Math.abs(data.saldo_final_cop))}</Text>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={styles.row}><Text style={styles.rowLabel}>Total pagado</Text><Text>{fmt.eur(data.paid_eur)}</Text></View>
              <View style={styles.row}><Text style={styles.rowLabel}>Saldo pendiente EUR</Text><Text style={styles.rowValue}>{fmt.eur(data.pending_eur)}</Text></View>
              {data.paid_in_cop_originally && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Saldo pendiente COP (referencia)</Text>
                  <Text>{fmt.cop(data.pending_cop_reference)}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {hayCierre ? (
          <View style={styles.yellowBox}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Sobre la tasa de cambio</Text>
            <Text>
              La tasa de cierre quedó en {fmt.num(data.settlement_trm)} COP/EUR el {fmt.date(data.settlement_date)}, y con
              ella se recalcularon todos tus abonos hechos en pesos: la columna «A tasa cierre» es la que cuenta. Un «=»
              significa que ese pago no se recalcula porque ya estaba en euros.
            </Text>
          </View>
        ) : conRecalculo && data.paid_in_cop_originally ? (
          <View style={styles.yellowBox}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Sobre la tasa de cambio</Text>
            <Text>
              El saldo en pesos es una referencia con la TRM de hoy ({fmt.num(data.current_trm)} COP/EUR). Un mes antes de
              la salida se fija la tasa de cierre y todos tus abonos en pesos se recalculan con ella, así que el monto
              final puede variar respecto al de hoy en cualquiera de los dos sentidos.
            </Text>
          </View>
        ) : null}

        <Text style={styles.footer}>El Camino con Naty · elcaminoconnaty.com · Documento generado automáticamente</Text>
      </Page>
    </Document>
  );
}
