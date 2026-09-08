import { base, Document, Membrete, Page, Pie, StyleSheet, Text, TONO, View } from "./brand-shell";
import { COLOR, ESCALA_PDF, FUENTE } from "@/lib/brand";
import { GLOBAL66 } from "@/lib/constants";

/** Lo propio de la liquidación: la caja de la tasa, las columnas y el bloque final. */
const styles = StyleSheet.create({
  // La tasa de cierre es el dato que explica todo el documento, así que va destacada.
  rateBox: {
    backgroundColor: COLOR.piedra,
    padding: 10,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: COLOR.ocre,
    marginBottom: 14,
  },
  rateLabel: {
    fontSize: ESCALA_PDF.micro,
    color: COLOR.ocreProfundo,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  rateValue: {
    fontSize: 15,
    fontFamily: FUENTE.display,
    fontWeight: 700,
    color: COLOR.atlantico,
    marginTop: 3,
  },
  rateNote: { fontSize: ESCALA_PDF.micro, color: COLOR.castano, marginTop: 3 },

  // Columnas de la tabla pago por pago.
  cDate: { flex: 1.05 },
  cAmount: { flex: 1.35, textAlign: "right", paddingRight: 5 },
  cRate: { flex: 0.85, textAlign: "right", paddingRight: 5 },
  cEur: { flex: 0.95, textAlign: "right", paddingRight: 5 },
  cEurC: { flex: 0.95, textAlign: "right", paddingRight: 5 },
  cMethod: { flex: 1.15 },

  totalBox: { borderWidth: 1, borderColor: COLOR.piedra, padding: 12, borderRadius: 4, marginTop: 4 },
  finalBox: { padding: 12, borderRadius: 4, marginTop: 12 },
  finalLabel: { fontSize: ESCALA_PDF.caption, textTransform: "uppercase", letterSpacing: 1.2 },
  finalAmount: { fontSize: 21, fontFamily: FUENTE.display, fontWeight: 700, marginTop: 4 },
  finalSub: { fontSize: ESCALA_PDF.caption, marginTop: 3 },
  note: { fontSize: ESCALA_PDF.micro, color: COLOR.castano, marginTop: 10, lineHeight: 1.5 },
});

export type LiquidacionData = {
  registration_id: string;
  pilgrim_name: string;
  pilgrim_email: string | null;
  departure_name: string;
  departure_start_date: string | null;
  /** Valor del viaje con la penalidad incluida. */
  net_total_eur: number;
  penalty_eur: number;
  penalty_note: string | null;
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
  // Saldo a favor -> informativo; pendiente -> requiere acción; cerrado -> en orden.
  const tono = porDevolver ? TONO.info : porCobrar ? TONO.alerta : TONO.ok;
  const dif = Number(data.fx_difference_eur ?? 0);
  // Total de la columna de pesos: todos los pagos en COP, incluidos los que no
  // se re-valoran (Global 66), para que la fila de totales sume lo que se lista.
  const copListado = data.payments
    .filter((p) => p.currency === "COP")
    .reduce((acc, p) => acc + Number(p.amount), 0);

  return (
    <Document title={`Liquidación ${data.pilgrim_name}`} author="El Camino con Naty">
      <Page size="A4" style={base.page}>
        <Membrete />

        <Text style={base.title}>Liquidación final del viaje</Text>
        <Text style={base.subtitle}>
          {data.departure_name}
          {data.departure_start_date ? ` · salida ${fmt.dateLong(data.departure_start_date)}` : ""}
        </Text>

        <View style={base.section}>
          <Text style={base.sectionTitle}>Peregrino</Text>
          <View style={base.row}><Text style={base.rowLabel}>Nombre</Text><Text style={base.rowValue}>{data.pilgrim_name}</Text></View>
          {data.pilgrim_email && <View style={base.row}><Text style={base.rowLabel}>Email</Text><Text>{data.pilgrim_email}</Text></View>}
          {data.penalty_eur > 0 && (
            <>
              <View style={base.row}><Text style={base.rowLabel}>Precio del viaje</Text><Text>{fmt.eur(data.net_total_eur - data.penalty_eur)}</Text></View>
              <View style={base.row}>
                <Text style={base.rowLabel}>Penalidad{data.penalty_note ? ` (${data.penalty_note})` : ""}</Text>
                <Text>+ {fmt.eur(data.penalty_eur)}</Text>
              </View>
            </>
          )}
          <View style={base.row}><Text style={base.rowLabel}>Valor del viaje</Text><Text style={base.rowValue}>{fmt.eur(data.net_total_eur)}</Text></View>
          {data.total_cop_cierre != null && (
            <View style={base.row}><Text style={base.rowLabel}>Valor del viaje en pesos, a la tasa de cierre</Text><Text>{fmt.cop(data.total_cop_cierre)}</Text></View>
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

        <View style={base.section}>
          <Text style={base.sectionTitle}>Tus pagos, uno por uno</Text>
          <View style={base.table}>
            <View style={base.tableHead}>
              <Text style={styles.cDate}>Fecha</Text>
              <Text style={styles.cAmount}>Lo que pagaste</Text>
              <Text style={styles.cRate}>Tasa del día</Text>
              <Text style={styles.cEur}>Valió (EUR)</Text>
              <Text style={styles.cEurC}>A tasa cierre</Text>
              <Text style={styles.cMethod}>Medio</Text>
            </View>
            {data.payments.length === 0 ? (
              <View style={base.tableRow}><Text>Sin pagos registrados.</Text></View>
            ) : (
              data.payments.map((p, i) => (
                <View key={i} style={base.tableRow}>
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
            <View style={base.tableFoot}>
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
          <Text style={base.sectionTitle}>Cómo queda la cuenta</Text>
          <View style={base.row}>
            <Text style={base.rowLabel}>Valor del viaje{data.penalty_eur > 0 ? `, con penalidad de ${fmt.eur(data.penalty_eur)}` : ""}</Text>
            <Text>{fmt.eur(data.net_total_eur)}</Text>
          </View>
          {data.cop_revalorado > 0 && (
            <View style={base.row}>
              <Text style={base.rowLabel}>
                Tus abonos en pesos: {fmt.cop(data.cop_revalorado)} ÷ {fmt.num(trm, 2)}
              </Text>
              <Text>{fmt.eur(data.cop_revalorado / trm)}</Text>
            </View>
          )}
          {data.eur_fijo !== 0 && (
            <View style={base.row}>
              <Text style={base.rowLabel}>Tus abonos ya en euros</Text>
              <Text>{fmt.eur(data.eur_fijo)}</Text>
            </View>
          )}
          <View style={base.row}>
            <Text style={base.rowLabel}>Total abonado a la tasa de cierre</Text>
            <Text style={base.rowValue}>{fmt.eur(data.paid_eur_cierre)}</Text>
          </View>
        </View>

        <View style={[styles.finalBox, { backgroundColor: tono.fondo }]}>
          <Text style={[styles.finalLabel, { color: tono.texto }]}>
            {porDevolver ? "A devolverte" : porCobrar ? "Último pago del viaje" : "Viaje pagado completo"}
          </Text>
          <Text style={[styles.finalAmount, { color: tono.texto }]}>
            {cerrado
              ? fmt.eur(0)
              : porDevolver
                ? fmt.cop(data.por_devolver_cop)
                : fmt.cop(data.por_cobrar_cop)}
          </Text>
          <Text style={[styles.finalSub, { color: tono.texto }]}>
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

        <Pie />
      </Page>
    </Document>
  );
}
