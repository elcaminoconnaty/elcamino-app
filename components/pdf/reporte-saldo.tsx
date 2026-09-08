import { base, Document, Membrete, Page, Pie, StyleSheet, Text, View } from "./brand-shell";
import { FUENTE } from "@/lib/brand";

/** Anchos de la tabla de pagos. Todo lo demás sale de `base`. */
const col = StyleSheet.create({
  c1: { flex: 1.2, paddingRight: 4 },
  c2: { flex: 1.1, textAlign: "right", paddingRight: 6 },
  c3: { flex: 0.9, textAlign: "right", paddingRight: 6 },
  c4: { flex: 1.1, textAlign: "right", paddingRight: 8 },
  c5: { flex: 1.2, textAlign: "left" },
});

type ReporteData = {
  registration_id: string;
  pilgrim_name: string;
  pilgrim_email: string | null;
  departure_name: string;
  departure_start_date: string | null;
  /** Total acordado, con la penalidad incluida. */
  total_eur: number;
  penalty_eur: number;
  penalty_note: string | null;
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
      <Page size="A4" style={base.page}>
        <Membrete />

        <Text style={base.title}>Reporte de saldo</Text>
        <Text style={base.subtitle}>Generado el {fmt.date(new Date().toISOString().slice(0, 10))}</Text>

        <View style={base.section}>
          <Text style={base.sectionTitle}>Peregrino</Text>
          <View style={base.row}><Text style={base.rowLabel}>Nombre</Text><Text style={base.rowValue}>{data.pilgrim_name}</Text></View>
          {data.pilgrim_email && <View style={base.row}><Text style={base.rowLabel}>Email</Text><Text>{data.pilgrim_email}</Text></View>}
          <View style={base.row}><Text style={base.rowLabel}>Camino</Text><Text>{data.departure_name}</Text></View>
        </View>

        <View style={base.section}>
          <Text style={base.sectionTitle}>Historial de pagos</Text>
          <View style={base.table}>
            <View style={base.tableHead}>
              <Text style={col.c1}>Fecha</Text>
              <Text style={col.c2}>Monto orig.</Text>
              <Text style={col.c3}>Tasa del día</Text>
              <Text style={col.c4}>Equiv. EUR</Text>
              {hayCierre && <Text style={col.c4}>A tasa cierre</Text>}
              <Text style={col.c5}>Método pago</Text>
            </View>
            {data.payments.length === 0 ? (
              <View style={base.tableRow}><Text>Sin pagos registrados.</Text></View>
            ) : (
              data.payments.map((p, i) => (
                <View key={i} style={base.tableRow}>
                  <Text style={col.c1}>{fmt.date(p.paid_at)}</Text>
                  <Text style={col.c2}>
                    {fmt.num(p.amount)} {p.currency}
                    {p.kind === "devolucion" ? " (dev.)" : p.kind === "cierre" ? " (cierre)" : ""}
                  </Text>
                  <Text style={col.c3}>{p.trm_eur_cop ? fmt.num(p.trm_eur_cop) : "—"}</Text>
                  <Text style={col.c4}>{fmt.eur(p.amount_eur)}</Text>
                  {hayCierre && (
                    <Text style={col.c4}>{p.se_revalora ? fmt.eur(p.amount_eur_cierre) : "="}</Text>
                  )}
                  <Text style={col.c5}>{p.method ?? "—"}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={base.section}>
          <Text style={base.sectionTitle}>Resumen</Text>
          {data.penalty_eur > 0 ? (
            <>
              <View style={base.row}><Text style={base.rowLabel}>Precio del viaje</Text><Text>{fmt.eur(data.total_eur - data.penalty_eur)}</Text></View>
              <View style={base.row}>
                <Text style={base.rowLabel}>Penalidad{data.penalty_note ? ` (${data.penalty_note})` : ""}</Text>
                <Text>+ {fmt.eur(data.penalty_eur)}</Text>
              </View>
              <View style={base.row}><Text style={base.rowLabel}>Total acordado</Text><Text style={base.rowValue}>{fmt.eur(data.total_eur)}</Text></View>
            </>
          ) : (
            <View style={base.row}><Text style={base.rowLabel}>Total acordado</Text><Text>{fmt.eur(data.total_eur)}</Text></View>
          )}
          {hayCierre ? (
            <>
              <View style={base.row}><Text style={base.rowLabel}>Total abonado, a la tasa de cierre</Text><Text>{fmt.eur(data.paid_eur_cierre)}</Text></View>
              <View style={base.row}>
                <Text style={base.rowLabel}>{saldo < -0.5 ? "Saldo a tu favor" : "Saldo pendiente"}</Text>
                <Text style={base.rowValue}>{fmt.eur(Math.abs(saldo) <= 0.5 ? 0 : Math.abs(saldo))}</Text>
              </View>
              {data.saldo_final_cop != null && Math.abs(saldo) > 0.5 && (
                <View style={base.row}>
                  <Text style={base.rowLabel}>{saldo < 0 ? "A devolverte en pesos" : "Saldo pendiente en pesos"}</Text>
                  <Text>{fmt.cop(Math.abs(data.saldo_final_cop))}</Text>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={base.row}><Text style={base.rowLabel}>Total pagado</Text><Text>{fmt.eur(data.paid_eur)}</Text></View>
              <View style={base.row}><Text style={base.rowLabel}>Saldo pendiente EUR</Text><Text style={base.rowValue}>{fmt.eur(data.pending_eur)}</Text></View>
              {data.paid_in_cop_originally && (
                <View style={base.row}>
                  <Text style={base.rowLabel}>Saldo pendiente COP (referencia)</Text>
                  <Text>{fmt.cop(data.pending_cop_reference)}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {hayCierre ? (
          <View style={base.noteBox}>
            <Text style={base.noteTitle}>Sobre la tasa de cambio</Text>
            <Text>
              La tasa de cierre quedó en {fmt.num(data.settlement_trm)} COP/EUR el {fmt.date(data.settlement_date)}, y con
              ella se recalcularon todos tus abonos hechos en pesos: la columna «A tasa cierre» es la que cuenta. Un «=»
              significa que ese pago no se recalcula porque ya estaba en euros.
            </Text>
          </View>
        ) : conRecalculo && data.paid_in_cop_originally ? (
          <View style={base.noteBox}>
            <Text style={base.noteTitle}>Sobre la tasa de cambio</Text>
            <Text>
              El saldo en pesos es una referencia con la TRM de hoy ({fmt.num(data.current_trm)} COP/EUR). Un mes antes de
              la salida se fija la tasa de cierre y todos tus abonos en pesos se recalculan con ella, así que el monto
              final puede variar respecto al de hoy en cualquiera de los dos sentidos.
            </Text>
          </View>
        ) : null}

        <Pie />
      </Page>
    </Document>
  );
}
