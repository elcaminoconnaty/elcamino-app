import Link from "next/link";
import { AlertTriangle, ExternalLink, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { armarDocumentoDeViaje, fechaBreve } from "@/lib/travel-doc/datos";
import { AccionesDocumento } from "@/components/departures/acciones-documento";
import { EditorPortada } from "@/components/departures/editor-portada";

/**
 * Donde Naty arma y manda el documento de viaje.
 *
 * Casi todo el trabajo ya está hecho en otras pantallas: el itinerario sale de las etapas de
 * la ruta y los alojamientos de las reservas. Acá solo se decide la portada, se revisa qué
 * falta y se manda.
 */
export async function DocumentoTab({ departureId }: { departureId: string }) {
  const supabase = createClient();
  const [{ data: dep }, doc] = await Promise.all([
    supabase.from("departures").select("travel_doc, travel_doc_token, travel_doc").eq("id", departureId).single(),
    armarDocumentoDeViaje(departureId),
  ]);

  const token = dep?.travel_doc_token as string | null;
  const portada = (dep?.travel_doc ?? {}) as Record<string, string>;

  // Los pendientes se agrupan por hotel: nueve líneas sueltas no se leen, siete hoteles sí.
  const porHotel = new Map<string, string[]>();
  for (const p of doc.pendientes) {
    const [hotel, que] = p.includes(":") ? [p.split(":")[0], p.split(":").slice(1).join(":").trim()] : ["General", p];
    porHotel.set(hotel, [...(porHotel.get(hotel) ?? []), que]);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Documento de viaje</CardTitle>
            <CardDescription>
              El itinerario y los alojamientos, tal como los va a ver el peregrino. Se arma solo
              desde las reservas y las etapas: no hay que escribir nada dos veces.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-widest text-ocre-profundo">Recorrido</dt>
                <dd className="mt-1">{doc.recorrido ?? "—"}{doc.km ? ` · ${doc.km} km` : ""}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-ocre-profundo">Días</dt>
                <dd className="mt-1">
                  {doc.dias.length}
                  {doc.diasCompletos.length !== doc.dias.length && (
                    <span className="text-muted-foreground">
                      {" "}de {doc.diasCompletos.length} de la ruta
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-ocre-profundo">Alojamientos</dt>
                <dd className="mt-1">{doc.alojamientos.length}</dd>
              </div>
            </dl>

            <AccionesDocumento departureId={departureId} token={token} inscritos={0} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portada</CardTitle>
            <CardDescription>Lo único que no sale de la operación.</CardDescription>
          </CardHeader>
          <CardContent>
            <EditorPortada departureId={departureId} valores={portada} />
          </CardContent>
        </Card>
      </div>

      {porHotel.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-aviso-700" />
              Qué le falta al documento
            </CardTitle>
            <CardDescription>
              Se puede mandar así, pero cada hueco es una pregunta que el peregrino te va a
              hacer por WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Array.from(porHotel.entries()).map(([hotel, faltas]) => (
              <div key={hotel} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{hotel}</span>
                <span className="text-muted-foreground">{faltas.join(", ")}</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2">
              La dirección, las horas y las fotos se cargan en la ficha de cada proveedor, y
              sirven para todos los caminos donde aparezca.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alojamientos del documento</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {doc.alojamientos.map((a) => (
            <div key={a.clave} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
              <div>
                <span className="font-medium">
                  {a.ciudad ? `${a.ciudad}: ` : ""}
                  {a.nombre}
                </span>
                <span className="text-muted-foreground">
                  {" · "}
                  {a.noches > 1 ? `${a.noches} noches` : fechaBreve(a.desde)}
                  {a.acomodacion ? ` · ${a.acomodacion}` : ""}
                </span>
                {a.compartidoCon && (
                  <div className="text-xs text-aviso-700 mt-0.5">
                    Comparte noche con {a.compartidoCon}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className={a.fotos.length ? "text-ok-700" : "text-muted-foreground"}>
                  {a.fotos.length} fotos
                </span>
                <span className={a.direccion ? "text-ok-700" : "text-muted-foreground"}>
                  {a.direccion ? "con dirección" : "sin dirección"}
                </span>
              </div>
            </div>
          ))}
          {doc.alojamientos.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Este camino todavía no tiene reservas de alojamiento cargadas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
