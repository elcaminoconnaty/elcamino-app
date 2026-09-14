import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEUR, formatDate, cn } from "@/lib/utils";
import { armarInformePagos, type Giro } from "@/lib/pagos-pendientes/datos";
import { rutaCamino } from "@/lib/rutas";
import { Download, FileText, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

/** Cuánto alcance mirar: lo de esta semana, lo del mes o todo lo que hay. */
const PLAZOS = [
  { key: "7", label: "Esta semana", dias: 7 },
  { key: "30", label: "Este mes", dias: 30 },
  { key: "todo", label: "Todo", dias: null as number | null },
];

function enDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function FilaGiro({ g }: { g: Giro }) {
  const datos =
    g.medio === "transferencia"
      ? [g.titular, g.iban, g.swift].filter(Boolean).join(" · ")
      : g.medio === "bizum"
        ? [g.bizum, g.titular].filter(Boolean).join(" · ")
        : g.titular ?? "";
  return (
    <TableRow className={g.vencida ? "bg-error-50/50" : undefined}>
      <TableCell>
        <div className="font-medium">{g.proveedor}</div>
        <div className="text-xs text-muted-foreground">{g.servicio}</div>
      </TableCell>
      <TableCell className="text-sm">
        <Link href={rutaCamino(g.departure_id)} className="hover:underline">{g.camino}</Link>
      </TableCell>
      <TableCell className="text-sm">{g.concepto}</TableCell>
      <TableCell className="text-sm">
        {g.vence ? (
          <span className={cn(g.vencida && "text-error-700 font-medium")}>
            {formatDate(g.vence)}{g.vencida ? " · vencida" : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">Sin fecha</span>
        )}
      </TableCell>
      <TableCell className="text-right font-medium">
        {formatEUR(g.monto_eur)}
        {g.monto_moneda != null && (
          <div className="text-xs text-muted-foreground">{g.monto_moneda.toFixed(2)} {g.moneda}</div>
        )}
      </TableCell>
      <TableCell className="text-sm">
        <div className="text-xs">{datos || "—"}</div>
        {g.referencia && <div className="text-xs text-muted-foreground">Concepto: {g.referencia}</div>}
        {g.faltan.length > 0 && (
          <div className="text-xs text-error-700 flex items-center gap-1 mt-0.5">
            <AlertTriangle className="h-3 w-3 shrink-0" /> Falta: {g.faltan.join(", ")}
          </div>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{g.cuenta_origen ?? "—"}</TableCell>
    </TableRow>
  );
}

function Grupo({ titulo, giros }: { titulo: string; giros: Giro[] }) {
  if (giros.length === 0) return null;
  const total = giros.reduce((s, g) => s + g.monto_eur, 0);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>{titulo}</CardTitle>
          <div className="text-sm text-muted-foreground">
            {giros.length} pago{giros.length > 1 ? "s" : ""} · <strong className="text-foreground">{formatEUR(total)}</strong>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead>Camino</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>Datos para pagar</TableHead>
              <TableHead>Sale de</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {giros.map((g, i) => <FilaGiro key={`${g.reservation_id}-${i}`} g={g} />)}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * Qué hay que pagarle a los proveedores, de todos los caminos a la vez. Es la pantalla
 * para sentarse a girar: se elige el plazo, se mira lo vencido y se baja el Excel con
 * los datos sueltos para el banco.
 */
export default async function PagosProveedoresPage({ searchParams }: { searchParams: { plazo?: string } }) {
  const plazo = PLAZOS.find((p) => p.key === searchParams.plazo) ?? PLAZOS[2];
  const hasta = plazo.dias != null ? enDias(plazo.dias) : null;

  const supabase = createClient();
  const data = await armarInformePagos(supabase, { departureId: null, hasta });
  if (!data) return <div className="text-sm text-muted-foreground">No se pudo armar el informe.</div>;

  const qs = hasta ? `?hasta=${hasta}` : "";
  const transferencias = data.giros.filter((g) => g.medio === "transferencia");
  const bizums = data.giros.filter((g) => g.medio === "bizum");
  const resto = data.giros.filter((g) => g.medio !== "transferencia" && g.medio !== "bizum");
  const incompletos = data.giros.filter((g) => g.faltan.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-noche">Qué hay que pagar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todo lo que se le debe a proveedores, de todos los caminos, con los datos para girar al lado.
        </p>
        <div className="brand-yellow-bar mt-2" />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 flex-wrap">
          {PLAZOS.map((p) => (
            <Link
              key={p.key}
              href={`/pagos-proveedores?plazo=${p.key}`}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm",
                p.key === plazo.key ? "bg-ocre text-noche font-medium" : "bg-piedra-suave text-muted-foreground hover:bg-piedra"
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/export/pagos-proveedores${qs}`}><Download className="h-4 w-4" /> Excel</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/pdf/pagos-proveedores${qs}`} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" /> PDF</a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase tracking-widest text-castano">Falta por pagar</div>
          <div className="font-display text-2xl text-noche mt-1">{formatEUR(data.totales.saldo_eur)}</div>
          {data.totales.saldo_cop != null && (
            <div className="text-xs text-muted-foreground">{new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(data.totales.saldo_cop)}</div>
          )}
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase tracking-widest text-castano">Pagos por hacer</div>
          <div className="font-display text-2xl text-noche mt-1">{data.giros.length}</div>
        </CardContent></Card>
        <Card className={data.totales.vencido_eur > 0 ? "border-error-300" : undefined}><CardContent className="pt-6">
          <div className="text-xs uppercase tracking-widest text-castano">Ya vencido</div>
          <div className={cn("font-display text-2xl mt-1", data.totales.vencido_eur > 0 ? "text-error-700" : "text-noche")}>
            {formatEUR(data.totales.vencido_eur)}
          </div>
        </CardContent></Card>
        <Card className={data.totales.bloqueado_eur > 0 ? "border-aviso-300" : undefined}><CardContent className="pt-6">
          <div className="text-xs uppercase tracking-widest text-castano">Frenado por datos</div>
          <div className={cn("font-display text-2xl mt-1", data.totales.bloqueado_eur > 0 ? "text-aviso-800" : "text-noche")}>
            {formatEUR(data.totales.bloqueado_eur)}
          </div>
        </CardContent></Card>
      </div>

      {incompletos.length > 0 && (
        <Card className="border-aviso-300 bg-aviso-50/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-aviso-700" />
              {incompletos.length} pago{incompletos.length > 1 ? "s" : ""} sin datos completos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {incompletos.slice(0, 8).map((g, i) => (
              <div key={i} className="flex justify-between gap-3 flex-wrap">
                <span>{g.proveedor} · {g.servicio}</span>
                <span className="text-aviso-800">falta {g.faltan.join(", ")}</span>
              </div>
            ))}
            {incompletos.length > 8 && <div className="text-xs text-muted-foreground">y {incompletos.length - 8} más.</div>}
            <p className="text-xs text-muted-foreground pt-1">
              Se arreglan en la ficha del proveedor (Cómo se le paga) o en la reserva (Cómo se paga esta reserva).
            </p>
          </CardContent>
        </Card>
      )}

      {data.giros.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No hay pagos pendientes en este plazo.
        </CardContent></Card>
      )}

      <Grupo titulo="Transferencias" giros={transferencias} />
      <Grupo titulo="Bizum" giros={bizums} />
      <Grupo titulo="Otros medios y sin definir" giros={resto} />

      {data.avisos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Revisar</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {data.avisos.map((a, i) => <div key={i}>{a}</div>)}
          </CardContent>
        </Card>
      )}

      {data.otros.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Otros del presupuesto</CardTitle>
            <div className="text-sm text-muted-foreground">Viáticos, tiquetes y materiales que no son reservas.</div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.otros.map((o, i) => (
                  <TableRow key={i}>
                    <TableCell>{o.descripcion}</TableCell>
                    <TableCell><Badge variant="muted">{o.categoria}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{formatEUR(o.saldo_eur)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
