import { base, Document, Membrete, Page, Pie, Text, View } from "./brand-shell";
import { FUENTE } from "@/lib/brand";
import { GLOBAL66 } from "@/lib/constants";


type ReciboData = {
  payment_id: string;
  paid_at: string;
  amount: number;
  currency: string;
  trm_eur_cop: number | null;
  amount_eur: number | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
  kind: "abono" | "cierre" | "devolucion";
  pilgrim_name: string;
  pilgrim_email: string | null;
  departure_name: string;
  departure_start_date: string | null;
  total_eur: number;
  /** Euros que realmente entraron, sumando los pagos como se hicieron. */
  paid_total_eur: number;
  /** Euros acreditados al viaje: los abonos en pesos ya a la tasa de cierre. */
  paid_eur_cierre: number;
  pending_eur: number;
  /** Saldo a la tasa de cierre. Negativo = a favor del peregrino. */
  saldo_final_eur: number | null;
  saldo_final_cop: number | null;
  settlement_trm: number | null;
  settlement_date: string | null;
  /** "recalculo" | "sin_recalculo": si el camino re-valora los abonos en pesos. */
  settlement_mode: string;
  paid_in_cop_originally: boolean;
};

const fmt = {
  date(d: string | null) {
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
  num(n: number | null | undefined) {
    if (n == null) return "—";
    return new Intl.NumberFormat("es-CO").format(Number(n));
  },
};

const TITULO: Record<string, string> = {
  abono: "Recibo de pago",
  cierre: "Recibo del pago de cierre",
  devolucion: "Comprobante de devolución",
};

export function ReciboPagoPDF({ data }: { data: ReciboData }) {
  const code = data.payment_id.slice(0, 8).toUpperCase();
  const esDevolucion = data.kind === "devolucion";
  const conRecalculo = data.settlement_mode !== "sin_recalculo";
  const hayCierre = conRecalculo && data.settlement_trm != null && Number(data.settlement_trm) > 0;
  const saldo = data.saldo_final_eur != null ? Number(data.saldo_final_eur) : Number(data.pending_eur);
  return (
    <Document title={`${TITULO[data.kind] ?? "Recibo"} ${code}`} author="El Camino con Naty">
      <Page size="A4" style={base.page}>
        <Membrete />

        <Text style={base.title}>{TITULO[data.kind] ?? "Recibo de pago"}</Text>
        <Text style={base.subtitle}>N° {code} · {fmt.date(data.paid_at)}</Text>

        <View style={base.section}>
          <Text style={base.sectionTitle}>Peregrino</Text>
          <View style={base.row}><Text style={base.rowLabel}>Nombre</Text><Text style={base.rowValue}>{data.pilgrim_name}</Text></View>
          {data.pilgrim_email && <View style={base.row}><Text style={base.rowLabel}>Email</Text><Text>{data.pilgrim_email}</Text></View>}
          <View style={base.row}><Text style={base.rowLabel}>Camino</Text><Text>{data.departure_name}</Text></View>
        </View>

        <View style={base.box}>
          <Text style={base.sectionTitle}>{esDevolucion ? "Monto devuelto" : "Pago recibido"}</Text>
          <Text style={base.bigAmount}>
            {fmt.num(Math.abs(data.amount))} {data.currency}
          </Text>
          <View style={base.row}><Text style={base.rowLabel}>Equivalente en EUR</Text><Text style={base.rowValue}>{fmt.eur(Math.abs(Number(data.amount_eur ?? 0)))}</Text></View>
          {data.trm_eur_cop && (
            <View style={base.row}>
              {/* Con Global 66 la tasa es la de la plataforma (comisión incluida), no la TRM del día */}
              <Text style={base.rowLabel}>
                {data.method === GLOBAL66
                  ? `Tasa ${GLOBAL66}`
                  : data.kind === "abono"
                    ? "Tasa aplicada"
                    : "Tasa de cierre"}
              </Text>
              <Text>{fmt.num(data.trm_eur_cop)} COP/EUR</Text>
            </View>
          )}
          {data.method && <View style={base.row}><Text style={base.rowLabel}>Método</Text><Text>{data.method}</Text></View>}
          {data.reference && <View style={base.row}><Text style={base.rowLabel}>Referencia</Text><Text>{data.reference}</Text></View>}
        </View>

        <View style={base.section}>
          <Text style={base.sectionTitle}>Estado del viaje</Text>
          <View style={base.row}><Text style={base.rowLabel}>Total acordado</Text><Text>{fmt.eur(data.total_eur)}</Text></View>
          {hayCierre ? (
            <>
              <View style={base.row}>
                <Text style={base.rowLabel}>Total abonado, a la tasa de cierre</Text>
                <Text>{fmt.eur(data.paid_eur_cierre)}</Text>
              </View>
              <View style={base.row}>
                <Text style={base.rowLabel}>{saldo < -0.5 ? "Saldo a tu favor" : "Saldo pendiente"}</Text>
                <Text style={base.rowValue}>
                  {fmt.eur(Math.abs(saldo) <= 0.5 ? 0 : Math.abs(saldo))}
                  {data.saldo_final_cop != null && Math.abs(saldo) > 0.5
                    ? ` · ${fmt.cop(Math.abs(data.saldo_final_cop))}`
                    : ""}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={base.row}><Text style={base.rowLabel}>Total pagado</Text><Text>{fmt.eur(data.paid_total_eur)}</Text></View>
              <View style={base.row}><Text style={base.rowLabel}>Saldo pendiente</Text><Text style={base.rowValue}>{fmt.eur(data.pending_eur)}</Text></View>
            </>
          )}
        </View>

        {hayCierre ? (
          <View style={base.noteBox}>
            <Text style={base.noteTitle}>Sobre la tasa de cambio</Text>
            <Text>
              La tasa de cierre quedó en {fmt.num(data.settlement_trm)} COP/EUR el {fmt.date(data.settlement_date)}. Todos
              tus abonos hechos en pesos se recalcularon con ella, así que el saldo de arriba ya está a la tasa
              final. El detalle pago por pago está en tu liquidación final.
            </Text>
          </View>
        ) : conRecalculo && data.paid_in_cop_originally ? (
          <View style={base.noteBox}>
            <Text style={base.noteTitle}>Importante sobre la tasa de cambio</Text>
            <Text>
              Un mes antes de la salida se fija la tasa de cierre y todos tus abonos en pesos se recalculan con ella.
              El saldo final en pesos puede variar respecto al estimado de hoy, en cualquiera de los dos sentidos.
            </Text>
          </View>
        ) : null}

        <Pie />
      </Page>
    </Document>
  );
}
