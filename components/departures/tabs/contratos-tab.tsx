import Link from "next/link";
import { rutaPeregrino } from "@/lib/rutas";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractCard, type EstadoContrato } from "@/components/pilgrims/contract-card";
import { revisarContrato } from "@/lib/actions/contracts";
import type { RevisionContrato } from "@/lib/contracts/datos";
import { EnvioMasivoContratos } from "@/components/contracts/envio-masivo";

/**
 * Los contratos de un camino, todos en una pantalla.
 *
 * Existe porque los pendientes solo se veían de a un peregrino, en su ficha: para saber a
 * quién le falta qué en una salida había que abrir las fichas una por una, y no había forma
 * de ver cuánto le queda al camino para poder mandar todo a firmar.
 *
 * Los botones no se reimplementan acá: es la misma `ContractCard` de la ficha del peregrino,
 * que ya sabe generar, enviar, verificar y anular. Si se duplicaran, tarde o temprano una de
 * las dos se quedaría sin un arreglo.
 */
export async function ContratosTab({ departureId }: { departureId: string }) {
  const supabase = createClient();

  // El equipo (Naty y Nico) no firma contrato, y los borrados no se muestran.
  const { data: regs } = await supabase
    .from("registrations")
    .select("id, status, pilgrim_id, pilgrims:pilgrim_id ( full_name, is_team, deleted_at )")
    .eq("departure_id", departureId);

  const inscripciones = (regs ?? [])
    .filter((r: any) => r.pilgrims && !r.pilgrims.is_team && !r.pilgrims.deleted_at)
    .filter((r: any) => r.status !== "cancelado")
    .sort((a: any, b: any) => String(a.pilgrims.full_name).localeCompare(String(b.pilgrims.full_name), "es"));

  const regIds = inscripciones.map((r: any) => r.id);

  const { data: contratos } = regIds.length
    ? await supabase
        .from("contracts")
        .select("id, registration_id, status, version, access_token, sent_at, viewed_at, signed_at, pdf_signed_sha256")
        .in("registration_id", regIds)
        .in("status", ["borrador", "enviado", "visto", "firmado"])
    : { data: [] as any[] };

  const contratoByReg = new Map<string, EstadoContrato>(
    (contratos ?? []).map((c: any) => [
      c.registration_id,
      {
        id: c.id,
        status: c.status,
        version: c.version,
        codigo: String(c.access_token).slice(0, 8).toUpperCase(),
        sentAt: c.sent_at,
        viewedAt: c.viewed_at,
        signedAt: c.signed_at,
        huella: c.pdf_signed_sha256,
        urlVerificacion: c.pdf_signed_sha256
          ? `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/verificar/${c.pdf_signed_sha256}`
          : null,
      },
    ])
  );

  // `revisarContrato` solo lee. El try/catch es por fila: un peregrino con un dato raro no
  // puede dejar sin pantalla a los otros nueve.
  const revisiones = new Map<string, RevisionContrato>(
    await Promise.all(
      regIds.map(async (id: string): Promise<[string, RevisionContrato]> => {
        try {
          return [id, await revisarContrato(id)];
        } catch {
          return [id, { pendientes: [], avisos: [], datos: {}, listo: false }];
        }
      })
    )
  );

  const emitidos = inscripciones.filter((r: any) => contratoByReg.has(r.id));
  const firmados = emitidos.filter((r: any) => contratoByReg.get(r.id)?.status === "firmado");
  const listos = inscripciones.filter(
    (r: any) => !contratoByReg.has(r.id) && (revisiones.get(r.id)?.pendientes.length ?? 0) === 0
  );

  // Un aviso que le sale a todos los peregrinos no es de ninguno: es del camino (las fechas
  // de operación, las cuotas que no cuadran). Va una vez arriba y no trece veces abajo. Lo
  // que le salga solo a algunos —un pasaporte por vencer— se queda en su tarjeta.
  const avisosDelCamino = (revisiones.get(regIds[0])?.avisos ?? []).filter((a) =>
    regIds.every((id) => (revisiones.get(id)?.avisos ?? []).includes(a))
  );
  const esDelCamino = new Set(avisosDelCamino);

  if (!inscripciones.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Aún no hay peregrinos inscritos en este camino.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Contratos del camino</CardTitle>
            <EnvioMasivoContratos departureId={departureId} />
          </div>
          <CardDescription>
            {firmados.length} firmado{firmados.length === 1 ? "" : "s"} · {emitidos.length} emitido
            {emitidos.length === 1 ? "" : "s"} · {listos.length} listo{listos.length === 1 ? "" : "s"} para
            emitir, de {inscripciones.length} peregrino{inscripciones.length === 1 ? "" : "s"}.
            {inscripciones.length - emitidos.length - listos.length > 0 && (
              <>
                {" "}
                A {inscripciones.length - emitidos.length - listos.length} le
                {inscripciones.length - emitidos.length - listos.length === 1 ? "" : "s"} falta algún dato.
              </>
            )}
          </CardDescription>
        </CardHeader>
        {avisosDelCamino.length > 0 && (
          <CardContent className="space-y-2 pt-0">
            {avisosDelCamino.map((a) => (
              <p key={a} className="text-xs flex gap-2 items-start text-aviso-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{a}</span>
              </p>
            ))}
            <p className="text-xs text-muted-foreground">
              Las fechas del contrato, el nombre del plan, el origen, el destino y el Anexo No. 1 se
              cargan en el{" "}
              <Link href={`/caminos/${departureId}/wizard`} className="underline">
                asistente del camino
              </Link>
              .
            </p>
          </CardContent>
        )}
      </Card>

      {inscripciones.map((r: any) => {
        const rev = revisiones.get(r.id);
        return (
          <Card key={r.id}>
            <CardContent className="pt-6">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <Link href={rutaPeregrino(r.pilgrim_id, departureId)} className="font-medium hover:underline">
                  {r.pilgrims.full_name}
                </Link>
                <Link
                  href={rutaPeregrino(r.pilgrim_id, departureId)}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Abrir la ficha →
                </Link>
              </div>
              <ContractCard
                registrationId={r.id}
                pilgrimId={r.pilgrim_id}
                contrato={contratoByReg.get(r.id) ?? null}
                pendientes={rev?.pendientes ?? []}
                // Los del camino ya van arriba; acá solo lo que es de este peregrino.
                avisos={(rev?.avisos ?? []).filter((a) => !esDelCamino.has(a))}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
