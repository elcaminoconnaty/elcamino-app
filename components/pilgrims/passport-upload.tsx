"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getPassportUploadUrl, extractPassportFromStorage, getPassportImageUrl } from "@/lib/actions/passport";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import { Upload, Eye, Sparkles, FileCheck2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

export function PassportUpload({ pilgrim }: { pilgrim: any }) {
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState<"idle" | "uploading" | "analyzing">("idle");
  const router = useRouter();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Solo imágenes", variant: "destructive" });
      return;
    }

    setUploading(true);
    setStage("uploading");
    try {
      // 1. Pedir signed URL al server
      const { path, signedUrl, token } = await getPassportUploadUrl(pilgrim.id, file.name);

      // 2. Subir directo al Storage (sin pasar por server action)
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("passports")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (upErr) throw new Error(`Upload: ${upErr.message}`);

      // 3. Pedir al server que llame a Claude Vision con el archivo del Storage
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

  async function viewPassport() {
    const url = await getPassportImageUrl(pilgrim.id);
    if (url) window.open(url, "_blank");
    else toast({ title: "No hay imagen de pasaporte", variant: "destructive" });
  }

  const hasPassport = !!pilgrim.passport_image_path;

  return (
    <div className="space-y-2 text-sm">
      {hasPassport ? (
        <>
          <div className="flex items-center gap-2 text-green-700">
            <FileCheck2 className="h-4 w-4" />
            <span className="text-xs">Pasaporte cargado</span>
          </div>
          {pilgrim.passport_number && (
            <div className="text-xs space-y-0.5">
              <div><span className="text-muted-foreground">N°:</span> {pilgrim.passport_number}</div>
              {pilgrim.nationality && <div><span className="text-muted-foreground">Nacionalidad:</span> {pilgrim.nationality}</div>}
              {pilgrim.passport_expiry_date && <div><span className="text-muted-foreground">Expira:</span> {formatDate(pilgrim.passport_expiry_date)}</div>}
              {pilgrim.sex && <div><span className="text-muted-foreground">Sexo:</span> {pilgrim.sex}</div>}
            </div>
          )}
          <div className="flex gap-1 flex-wrap pt-1">
            <Button variant="outline" size="sm" onClick={viewPassport}><Eye className="h-3.5 w-3.5" /> Ver</Button>
            <label className="inline-flex items-center gap-1 text-xs h-8 px-3 rounded-md border border-input bg-background hover:bg-cream-100 cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> Reemplazar
              <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={uploading} />
            </label>
          </div>
        </>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-camino-yellow/40 rounded-md p-4 hover:bg-camino-yellow/5 cursor-pointer">
          {stage === "uploading" ? (
            <>
              <Upload className="h-5 w-5 text-camino-deepYellow animate-pulse" />
              <span className="text-xs">Subiendo...</span>
            </>
          ) : stage === "analyzing" ? (
            <>
              <Sparkles className="h-5 w-5 text-camino-deepYellow animate-pulse" />
              <span className="text-xs">Analizando con Claude...</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-camino-deepYellow" />
              <span className="text-xs text-center">Subir foto del pasaporte<br/><span className="text-muted-foreground">Sin límite de peso · Claude extrae los datos</span></span>
            </>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={uploading} />
        </label>
      )}
    </div>
  );
}
