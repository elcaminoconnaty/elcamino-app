"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getPassportUploadUrl, extractPassportFromStorage, getPassportImageUrl } from "@/lib/actions/passport";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import { Upload, Eye, Sparkles, FileCheck2, FileText } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { ACEPTA_PASAPORTE, revisarArchivoDePasaporte, tipoDeArchivoDePasaporte } from "@/lib/passport/formatos";

export function PassportUpload({ pilgrim }: { pilgrim: any }) {
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState<"idle" | "uploading" | "analyzing">("idle");
  const [arrastrando, setArrastrando] = useState(false);
  // El contador evita el parpadeo: al pasar por encima de un hijo, el navegador dispara
  // dragleave del padre aunque el cursor nunca haya salido de la zona.
  const profundidad = useRef(0);
  const router = useRouter();

  async function subir(file: File) {
    const problema = revisarArchivoDePasaporte(file);
    if (problema) {
      toast({ title: "Ese archivo no sirve", description: problema, variant: "destructive" });
      return;
    }

    setUploading(true);
    setStage("uploading");
    try {
      // 1. Pedir signed URL al server
      const { path, token } = await getPassportUploadUrl(pilgrim.id, file.name);

      // 2. Subir directo al Storage (sin pasar por server action)
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("passports")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (upErr) throw new Error(`Upload: ${upErr.message}`);

      // 3. Pedir al server que llame a Claude con el archivo del Storage
      setStage("analyzing");
      const result = await extractPassportFromStorage(pilgrim.id, path);
      toast({
        title: "Datos extraídos",
        description: `Confianza: ${result.data.confidence}. Revisá los campos.`,
        variant: "success",
      });
      router.refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setStage("idle");
    setUploading(false);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Se limpia para que volver a elegir el mismo archivo dispare el change de nuevo.
    e.target.value = "";
    if (file) subir(file);
  }

  /** Arrastrar desde el Finder o el escritorio: se toma el primer archivo que sirva. */
  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      profundidad.current += 1;
      if (!uploading) setArrastrando(true);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      profundidad.current = Math.max(0, profundidad.current - 1);
      if (profundidad.current === 0) setArrastrando(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      profundidad.current = 0;
      setArrastrando(false);
      if (uploading) return;
      const archivos = Array.from(e.dataTransfer.files ?? []);
      const file = archivos.find((f) => tipoDeArchivoDePasaporte(f.type)) ?? archivos[0];
      if (file) subir(file);
    },
  };

  async function viewPassport() {
    const url = await getPassportImageUrl(pilgrim.id);
    if (url) window.open(url, "_blank");
    else toast({ title: "No hay pasaporte cargado", variant: "destructive" });
  }

  const hasPassport = !!pilgrim.passport_image_path;
  const esPdf = (pilgrim.passport_image_path ?? "").toLowerCase().endsWith(".pdf");

  function Progreso() {
    if (stage === "uploading") {
      return (
        <>
          <Upload className="h-5 w-5 text-ocre-profundo animate-pulse" />
          <span className="text-xs">Subiendo...</span>
        </>
      );
    }
    return (
      <>
        <Sparkles className="h-5 w-5 text-ocre-profundo animate-pulse" />
        <span className="text-xs">Analizando con Claude...</span>
      </>
    );
  }

  return (
    <div
      {...dropHandlers}
      className={cn(
        "space-y-2 text-sm rounded-md transition-colors",
        arrastrando && "ring-2 ring-ocre ring-offset-2 bg-ocre/5"
      )}
    >
      {hasPassport ? (
        <>
          <div className="flex items-center gap-2 text-ok-700">
            {esPdf ? <FileText className="h-4 w-4" /> : <FileCheck2 className="h-4 w-4" />}
            <span className="text-xs">Pasaporte cargado{esPdf ? " (PDF)" : ""}</span>
          </div>
          {pilgrim.passport_number && (
            <div className="text-xs space-y-0.5">
              <div><span className="text-muted-foreground">N°:</span> {pilgrim.passport_number}</div>
              {pilgrim.nationality && <div><span className="text-muted-foreground">Nacionalidad:</span> {pilgrim.nationality}</div>}
              {pilgrim.passport_expiry_date && <div><span className="text-muted-foreground">Expira:</span> {formatDate(pilgrim.passport_expiry_date)}</div>}
              {pilgrim.sex && <div><span className="text-muted-foreground">Sexo:</span> {pilgrim.sex}</div>}
            </div>
          )}
          {uploading ? (
            <div className="flex items-center gap-2 pt-1"><Progreso /></div>
          ) : (
            <div className="flex gap-1 flex-wrap pt-1">
              <Button variant="outline" size="sm" onClick={viewPassport}><Eye className="h-3.5 w-3.5" /> Ver</Button>
              <label className="inline-flex items-center gap-1 text-xs h-8 px-3 rounded-md border border-input bg-background hover:bg-piedra-suave cursor-pointer">
                <Upload className="h-3.5 w-3.5" /> Reemplazar
                <input type="file" accept={ACEPTA_PASAPORTE} className="hidden" onChange={onFile} disabled={uploading} />
              </label>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            {arrastrando ? "Soltá acá para reemplazarlo." : "También podés arrastrar un archivo acá para reemplazarlo."}
          </p>
        </>
      ) : (
        <label
          className={cn(
            "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md p-4 cursor-pointer transition-colors",
            arrastrando ? "border-ocre bg-ocre/10" : "border-ocre/40 hover:bg-ocre/5"
          )}
        >
          {uploading ? (
            <Progreso />
          ) : arrastrando ? (
            <>
              <Upload className="h-5 w-5 text-ocre-profundo" />
              <span className="text-xs text-center">Soltá el archivo acá</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-ocre-profundo" />
              <span className="text-xs text-center">
                Arrastrá el pasaporte acá o hacé clic
                <br />
                <span className="text-muted-foreground">Foto o PDF · Claude extrae los datos</span>
              </span>
            </>
          )}
          <input type="file" accept={ACEPTA_PASAPORTE} className="hidden" onChange={onFile} disabled={uploading} />
        </label>
      )}
    </div>
  );
}
