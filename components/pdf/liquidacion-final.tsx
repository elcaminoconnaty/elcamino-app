import { Page, Document, StyleSheet, Text, View } from "@react-pdf/renderer";
import { GLOBAL66 } from "@/lib/constants";

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a", backgroundColor: "#fdfaf3" },
  brandBar: { height: 4, width: 60, backgroundColor: "#f5c518", marginBottom: 20 },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, marginBottom: 3 },
  brandSub: { fontSize: 9, color: "#6b6b6b", marginBottom: 22 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  subtitle: { fontSize: 9.5, color: "#6b6b6b", marginBottom: 18 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 8.5, color: "#6b6b6b", textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 5 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  rowLabel: { color: "#6b6b6b" },
  rowValue: { fontFamily: "Helvetica-Bold" },

  rateBox: { backgroundColor: "#fef3c7", padding: 10, borderRadius: 4, marginBottom: 14 },
  rateLabel: { fontSize: 8.5, color: "#7c5e10", textTransform: "uppercase", letterSpacing: 1.2 },
  rateValue: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#7c5e10", marginTop: 2 },
  rateNote: { fontSize: 8.5, color: "#7c5e10", marginTop: 3 },

  table: { borderWidth: 0.5, borderColor: "#e6dcc2", borderRadius: 3, marginTop: 5 },
  tableHead: { flexDirection: "row", backgroundColor: "#faf3e3", paddingVertical: 5, paddingHorizontal: 5, fontSize: 7.5, color: "#6b6b6b", textTransform: "uppercase", letterSpacing: 0.6, borderBottomWidth: 0.5, borderBottomColor: "#e6dcc2" },
  tableRow: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 5, borderBottomWidth: 0.5, borderBottomColor: "#f0e7cf", fontSize: 8.5 },
  tableFoot: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 5, backgroundColor: "#faf3e3", fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  cDate: { flex: 1.05 },
  cAmount: { flex: 1.35, textAlign: "right", paddingRight: 5 },
  cRate: { flex: 0.85, textAlign: "right", paddingRight: 5 },
  cEur: { flex: 0.95, textAlign: "right", paddingRight: 5 },
  cEurC: { flex: 0.95, textAlign: "right", paddingRight: 5 },
  cMethod: { flex: 1.15 },

  totalBox: { borderWidth: 1, borderColor: "#e6dcc2", padding: 12, borderRadius: 4, marginTop: 4 },
  finalBox: { padding: 12, borderRadius: 4, marginTop: 12 },
  finalLabel: { fontSize: 9, textTransform: "uppercase", letterSpacing: 1.2 },
  finalAmount: { fontSize: 21, fontFamily: "Helvetica-Bold", marginTop: 3 },
  finalSub: { fontSize: 9, marginTop: 3 },
  note: { fontSize: 8, color: "#6b6b6b", marginTop: 10, lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 28, left: 44, right: 44, fontSize: 7.5, color: "#9a9a9a", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#e6dcc2", paddingTop: 7 },
});

export type LiquidacionData = {
  registration_id: string;
  pilgrim_name: string;
  pilgrim_email: string | null;
  departure_name: string;
  departure_start_date: string | null;
  net_total_eur: number;
  settlement_trm: number;
  settlement_date: string | null;
  paid_eur_historico: number;
  paid_eur_cierre: number;
  fx_difference_eur: number;
  cop_revalorado: number;
  eur_fijo: number;
  saldo_final_eur: number;
  saldo_final_cop: number | null;
  total_cop_cierre: number | null;
  por_cobrar_eur: number;
  por_cobrar_cop: number | null;
  por_devolver_eur: number;
  por_devolver_cop: number | null;
  devuelto_eur: number;
  devuelto_cop: number;
  estado_liquidacion: string;
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
  dateLong(d: string | null) {
    if (!d) return "—";
    return new Date(d + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  },
  eur(n: number | null | undefined) {
    if (n == null) return "—";
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "EUR" }).format(Number(n));
  },
  cop(n: number | null | undefined) {
    if (n == null) return "—";
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n));
  },
  num(n: number | null | undefined, dec = 0) {
    if (n == null) return "—";
    return new Intl.NumberFormat("es-CO", { maximumFractionDigits: dec }).format(Number(n));
  },
};

const KIND_LABEL: Record<string, string> = { abono: "", cierre: " (cierre)", devolucion: " (devolución)" };

/**
 * Recibo final del viaje: el historial completo de abonos con la tasa de cada
 * día, el recálculo a la tasa de cierre y el último movimiento — el pago que
 * falta o la devolución de lo que se pagó de más.
 */
export function LiquidacionFinalPDF({ data }: { data: LiquidacionData }) {
  const trm = Number(data.settlement_trm);
  const porDevolver = data.por_devolver_eur > 0.5;
  const porCobrar = data.por_cobrar_eur > 0.5;
  const cerrado = !porDevolver && !porCobrar;
  const dif = Number(data.fx_difference_eur ?? 0);
  // Total de la columna de pesos: todos los pagos en COP, incluidos los que no
  // se re-valoran (Global 66), para que la fila de totales sume lo que se lista.
  const copListado = data.payments
    .filter((p) => p.currency === "COP")
    .reduce((acc, p) => acc + Number(p.amount), 0);

  return (
    <Document title={`Liquidación ${data.pilgrim_name}`} author="El Camino con Naty">
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} />
        <Text style={styles.brand}>El Camino con Naty</Text>
        <Text style={styles.brandSub}>elcaminoconnaty.com</Text>

        <Text style={styles.title}>Liquidación final del viaje</Text>
        <Text style={styles.subtitle}>
          {data.departure_name}
          {data.departure_start_date ? ` · salida ${fmt.dateLong(data.departure_start_date)}` : ""}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Peregrino</Text>
          <View style={styles.row}><Text style={styles.rowLabel}>Nombre</Text><Text style={styles.rowValue}>{data.pilgrim_name}</Text></View>
          {data.pilgrim_email && <View style={styles.row}><Text style={styles.rowLabel}>Email</Text><Text>{data.pilgrim_email}</Text></View>}
          <View style={styles.row}><Text style={styles.rowLabel}>Valor del viaje</Text><Text style={styles.rowValue}>{fmt.eur(data.net_total_eur)}</Text></View>
          {data.total_cop_cierre != null && (
            <View style={styles.row}><Text style={styles.rowLabel}>Valor del viaje en pesos, a la tasa de cierre</Text><Text>{fmt.cop(data.total_cop_cierre)}</Text></View>
          )}
        </View>

        <View style={styles.rateBox}>
          <Text style={styles.rateLabel}>Tasa de cierre</Text>
          <Text style={styles.rateValue}>{fmt.num(trm, 2)} COP por EUR</Text>
          <Text style={styles.rateNote}>
            Fijada el {fmt.dateLong(data.settlement_date)}. Todos los abonos hechos en pesos se recalculan con esta
            tasa, como se acordó al inscribirse.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tus pagos, uno por uno</Text>
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={styles.cDate}>Fecha</Text>
              <Text style={styles.cAmount}>Lo que pagaste</Text>
              <Text style={styles.cRate}>Tasa del día</Text>
              <Text style={styles.cEur}>Valió (EUR)</Text>
              <Text style={styles.cEurC}>A tasa cierre</Text>
              <Text style={styles.cMethod}>Medio</Text>
            </View>
            {data.payments.length === 0 ? (
              <View style={styles.tableRow}><Text>Sin pagos registrados.</Text></View>
            ) : (
              data.payments.map((p, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={styles.cDate}>{fmt.date(p.paid_at)}</Text>
                  <Text style={styles.cAmount}>
                    {fmt.num(p.amount, 2)} {p.currency}
                    {KIND_LABEL[p.kind] ?? ""}
                  </Text>
                  <Text style={styles.cRate}>{p.trm_eur_cop ? fmt.num(p.trm_eur_cop, 2) : "—"}</Text>
                  <Text style={styles.cEur}>{fmt.eur(p.amount_eur)}</Text>
                  <Text style={styles.cEurC}>
                    {p.se_revalora ? fmt.eur(p.amount_eur_cierre) : "="}
                  </Text>
                  <Text style={styles.cMethod}>{p.method ?? "—"}</Text>
                </View>
              ))
            )}
            <View style={styles.tableFoot}>
              <Text style={styles.cDate}>Totales</Text>
              <Text style={styles.cAmount}>{copListado !== 0 ? fmt.cop(copListado) : "—"}</Text>
              <Text style={styles.cRate} />
              <Text style={styles.cEur}>{fmt.eur(data.paid_eur_historico)}</Text>
              <Text style={styles.cEurC}>{fmt.eur(data.paid_eur_cierre)}</Text>
              <Text style={styles.cMethod} />
            </View>
          </View>
          <Text style={styles.note}>
            La columna «Valió (EUR)» es lo que valían tus pesos el día que pagaste. «A tasa cierre» es lo que valen
            con la tasa final, y es la que cuenta para tu liquidación. Un «=» significa que ese pago no se recalcula
            porque ya estaba en euros
            {data.payments.some((p) => p.method === GLOBAL66) ? `, o porque por ${GLOBAL66} los pesos se cambian a euros el mismo día` : ""}.
          </Text>
        </View>

        <View style={styles.totalBox}>
          <Text style={styles.sectionTitle}>Cómo queda la cuenta</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Valor del viaje</Text>
            <Text>{fmt.eur(data.net_total_eur)}</Text>
          </View>
          {data.cop_revalorado > 0 && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>
                Tus abonos en pesos: {fmt.cop(data.cop_revalorado)} ÷ {fmt.num(trm, 2)}
              </Text>
              <Text>{fmt.eur(data.cop_revalorado / trm)}</Text>
            </View>
          )}
          {data.eur_fijo !== 0 && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Tus abonos ya en euros</Text>
              <Text>{fmt.eur(data.eur_fijo)}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total abonado a la tasa de cierre</Text>
            <Text style={styles.rowValue}>{fmt.eur(data.paid_eur_cierre)}</Text>
          </View>
        </View>

        <View style={[styles.finalBox, { backgroundColor: porDevolver ? "#dbeafe" : porCobrar ? "#fef3c7" : "#dcfce7" }]}>
          <Text style={[styles.finalLabel, { color: porDevolver ? "#1e3a8a" : porCobrar ? "#7c5e10" : "#14532d" }]}>
            {porDevolver ? "A devolverte" : porCobrar ? "Último pago del viaje" : "Viaje pagado completo"}
          </Text>
          <Text style={[styles.finalAmount, { color: porDevolver ? "#1e3a8a" : porCobrar ? "#7c5e10" : "#14532d" }]}>
            {cerrado
              ? fmt.eur(0)
              : porDevolver
                ? fmt.cop(data.por_devolver_cop)
                : fmt.cop(data.por_cobrar_cop)}
          </Text>
          <Text style={[styles.finalSub, { color: porDevolver ? "#1e3a8a" : porCobrar ? "#7c5e10" : "#14532d" }]}>
            {cerrado ? (
              data.devuelto_eur > 0.005
                ? `Ya se te devolvieron ${data.devuelto_cop > 0 ? fmt.cop(data.devuelto_cop) : fmt.eur(data.devuelto_eur)}. No queda saldo.`
                : "No queda saldo pendiente."
            ) : porDevolver ? (
              `Equivale a ${fmt.eur(data.por_devolver_eur)}. Pagaste de más porque tus abonos valen más euros a la tasa de cierre que cuando los hiciste.`
            ) : (
              `Equivale a ${fmt.eur(data.por_cobrar_eur)}, a la tasa de cierre de ${fmt.num(trm, 2)} COP/EUR.`
            )}
          </Text>
        </View>

        {Math.abs(dif) > 0.5 && (
          <Text style={styles.note}>
            Diferencia por el movimiento de la tasa entre el día de cada abono y el cierre:{" "}
            {dif > 0 ? "+" : "-"}{fmt.eur(Math.abs(dif))} sobre los {fmt.eur(data.paid_eur_historico)} que valían tus
            pagos cuando los hiciste. Este ajuste ya está aplicado en el total de arriba.
          </Text>
        )}

        <Text style={styles.footer}>
          El Camino con Naty · elcaminoconnaty.com · Liquidación generada el {fmt.date(new Date().toISOString().slice(0, 10))}
        </Text>
      </Page>
    </Document>
  );
}
