import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

/**
 * La carta de bienvenida de un peregrino, vista por el equipo dentro de la plataforma (con
 * su menú, su pestaña y su sello), en vez de un PDF suelto en una pestaña sin nombre.
 */
export const dynamic = "force-dynamic";

async function datos(registrationId: string) {
  const { data } = await createClient()
    .from("registrations")
    .select("id, pilgrim_id, departure_id, departures:departure_id(name), pilgrims:pilgrim_id(full_name)")
    .eq("id", registrationId)
    .maybeSingle();
  return data as any;
}

export async function generateMetadata({ params }: { params: { registrationId: string } }): Promise<Metadata> {
  const r = await datos(params.registrationId);
  return { title: r ? `Carta de bienvenida · ${r.pilgrims?.full_name}` : "Carta de bienvenida" };
}

export default async function CartaDelPeregrino({ params }: { params: { id: string; registrationId: string } }) {
  const r = await datos(params.registrationId);
  if (!r || r.pilgrim_id !== params.id) notFound();
  const pdf = `/api/pdf/bienvenida/${r.id}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/peregrinos/${params.id}?camino=${r.departure_id}`} className="text-sm text-muted-foreground hover:underline">
            ← {r.pilgrims?.full_name}
          </Link>
          <h1 className="font-display text-2xl text-noche mt-1">Carta de bienvenida</h1>
          <p className="text-sm text-muted-foreground">{r.departures?.name}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`${pdf}?descargar`}><Download className="h-4 w-4" /> Descargar PDF</a>
        </Button>
      </div>
      <iframe src={pdf} title="Carta de bienvenida" className="w-full rounded-md border bg-white" style={{ height: "82vh" }} />
    </div>
  );
}
