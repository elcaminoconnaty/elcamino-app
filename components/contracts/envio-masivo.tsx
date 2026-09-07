"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import {
  previsualizarEnvioMasivo,
  enviarContratosMasivo,
  type FilaPrevisualizacion,
  type ResultadoFila,
} from "@/lib/actions/contracts-bulk";
import { AlertTriangle, Check, Loader2, Send, X } from "lucide-react";

/**
 * Mandar los contratos de todo el camino de una vez.
 *
 * El botón no envía: abre la lista de a quién le llegaría un correo, con su dirección a la
 * vista y una casilla por persona. Los correos van a gente real y no se pueden "des-enviar",
 * así que el segundo clic es sobre nombres concretos, no sobre un "a todos" abstracto.
 */
export function EnvioMasivoContratos({ departureId }: { departureId: string }) {
  const [open, setOpen] = React.useState(false);
  const [cargando, setCargando] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [filas, setFilas] = React.useState<FilaPrevisualizacion[]>([]);
  const [marcadas, setMarcadas] = React.useState<Set<string>>(new Set());
  const [resultado, setResultado] = React.useState<ResultadoFila[] | null>(null);
  const router = useRouter();

  React.useEffect(() => {
    if (!open) return;
    setResultado(null);
    setCargando(true);
    previsualizarEnvioMasivo(departureId)
      .then((f) => {
        setFilas(f);
        // Solo vienen marcados los que de verdad pueden recibir el correo.
        setMarcadas(new Set(f.filter((x) => x.accion !== "omitir").map((x) => x.registrationId)));
      })
      .catch((e) => toast({ title: "No pude armar la lista", description: e.message, variant: "destructive" }))
      .finally(() => setCargando(false));
  }, [open, departureId]);

  const enviables = filas.filter((f) => f.accion !== "omitir");
  const omitidos = filas.filter((f) => f.accion === "omitir");
  const aEnviar = enviables.filter((f) => marcadas.has(f.registrationId));

  function alternar(id: string) {
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function enviar() {
    if (aEnviar.length === 0) return;
    setEnviando(true);
    try {
      const r = await enviarContratosMasivo(departureId, aEnviar.map((f) => f.registrationId));
      setResultado(r.filas);
      toast({
        title: r.fallidos === 0 ? "Contratos enviados" : "Envío con problemas",
        description: `${r.enviados} enviados${r.fallidos ? ` · ${r.fallidos} fallaron` : ""}`,
        variant: r.fallidos === 0 ? "success" : "destructive",
      });
      router.refresh();
    } catch (e: any) {
      toast({ title: "No se pudo enviar", description: e.message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Send className="h-3.5 w-3.5" /> Enviar a todos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {resultado ? "Resultado del envío" : "Enviar los contratos a firmar"}
          </DialogTitle>
        </DialogHeader>

        {cargando ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Revisando a cada peregrino…
          </div>
        ) : resultado ? (
          <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
            {resultado.map((r) => (
              <div key={r.registrationId} className="flex items-start gap-2 rounded-md border p-2.5 text-sm">
                {r.ok ? (
                  <Check className="h-4 w-4 text-ok-700 mt-0.5 shrink-0" />
                ) : (
                  <X className="h-4 w-4 text-error-700 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-medium">{r.nombre}</div>
                  <div className="text-xs text-muted-foreground break-words">
                    {r.email} · {r.detalle}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Este camino no tiene peregrinos con contrato pendiente.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Le va a llegar un correo con el enlace de firma a{" "}
              <strong>{aEnviar.length} persona{aEnviar.length === 1 ? "" : "s"}</strong>. Revisá la lista:
              los correos salen de verdad y no se pueden deshacer.
            </p>

            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
              {enviables.map((f) => (
                <label
                  key={f.registrationId}
                  className={cn(
                    "flex items-start gap-2.5 rounded-md border p-2.5 text-sm cursor-pointer hover:bg-accent/5",
                    marcadas.has(f.registrationId) ? "border-ocre bg-ocre/5" : "opacity-60"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={marcadas.has(f.registrationId)}
                    onChange={() => alternar(f.registrationId)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{f.nombre}</span>
                      <Badge variant="muted">
                        {f.accion === "generar_y_enviar" ? "nuevo" : "reenvío"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground break-words">{f.email}</div>
                    <div className="text-xs text-muted-foreground">{f.motivo}</div>
                  </div>
                </label>
              ))}
            </div>

            {omitidos.length > 0 && (
              <div className="rounded-md border border-aviso-200 bg-aviso-50 px-3 py-2 text-xs text-aviso-900 space-y-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {omitidos.length} no reciben correo
                </div>
                {omitidos.map((f) => (
                  <div key={f.registrationId}>
                    <strong>{f.nombre}:</strong> {f.motivo}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {resultado ? (
            <Button onClick={() => setOpen(false)}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={enviar} disabled={enviando || cargando || aEnviar.length === 0}>
                <Send className="h-4 w-4" />
                {enviando ? "Enviando…" : `Enviar a ${aEnviar.length}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
