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
  frozen_trm_eur_cop: number | null;
  frozen_trm_date: string | null;
  paid_in_cop_originally: boolean;
  current_trm: number | null;
  payments: Array<{ paid_at: string; amount: number; currency: string; trm_eur_cop: number | null; amount_eur: number | null; method: string | null }>;
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
              <Text style={styles.col3}>TRM</Text>
              <Text style={styles.col4}>Equiv. EUR</Text>
              <Text style={styles.col5}>Método pago</Text>
            </View>
            {data.payments.length === 0 ? (
              <View style={styles.tableRow}><Text>Sin pagos registrados.</Text></View>
            ) : (
              data.payments.map((p, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={styles.col1}>{fmt.date(p.paid_at)}</Text>
                  <Text style={styles.col2}>{fmt.num(p.amount)} {p.currency}</Text>
                  <Text style={styles.col3}>{p.trm_eur_cop ? fmt.num(p.trm_eur_cop) : "—"}</Text>
                  <Text style={styles.col4}>{fmt.eur(p.amount_eur)}</Text>
                  <Text style={styles.col5}>{p.method ?? "—"}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen</Text>
          <View style={styles.row}><Text style={styles.rowLabel}>Total acordado</Text><Text>{fmt.eur(data.total_eur)}</Text></View>
          <View style={styles.row}><Text style={styles.rowLabel}>Total pagado</Text><Text>{fmt.eur(data.paid_eur)}</Text></View>
          <View style={styles.row}><Text style={styles.rowLabel}>Saldo pendiente EUR</Text><Text style={styles.rowValue}>{fmt.eur(data.pending_eur)}</Text></View>
          {data.paid_in_cop_originally && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Saldo pendiente COP (referencia)</Text>
              <Text>{fmt.cop(data.pending_cop_reference)}</Text>
            </View>
          )}
        </View>

        {data.paid_in_cop_originally && (
          <View style={styles.yellowBox}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Sobre la tasa de cambio</Text>
            {data.frozen_trm_eur_cop ? (
              <Text>
                La tasa final fue congelada el {fmt.date(data.frozen_trm_date)} en {fmt.num(data.frozen_trm_eur_cop)} COP/EUR. El saldo pendiente en pesos se cobra con esta tasa.
              </Text>
            ) : (
              <Text>
                El saldo en pesos colombianos mostrado es una referencia con la TRM actual ({fmt.num(data.current_trm)} COP/EUR). El monto final se recalcula con la tasa del día 1 mes antes de la fecha de salida. Esto significa que el monto final en COP puede variar respecto al actual.
              </Text>
            )}
          </View>
        )}

        <Text style={styles.footer}>El Camino con Naty · elcaminoconnaty.com · Documento generado automáticamente</Text>
      </Page>
    </Document>
  );
}
