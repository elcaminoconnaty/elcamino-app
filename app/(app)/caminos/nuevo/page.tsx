import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createDeparture } from "@/lib/actions/departures";
import { DEPARTURE_STATUSES } from "@/lib/constants";
import { RouteQuickCreate } from "./route-quick-create";

export const dynamic = "force-dynamic";

export default async function NewDeparturePage() {
  const supabase = createClient();
  const { data: routes } = await supabase.from("routes").select("id, name, slug").eq("active", true).order("name");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/caminos" className="text-sm text-muted-foreground hover:underline">← Volver</Link>
        <h1 className="font-display text-2xl sm:text-3xl text-camino-ink mt-2">Nuevo camino</h1>
        <div className="brand-yellow-bar mt-2" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos del camino</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createDeparture} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" name="name" required placeholder="Camino Francés — Septiembre 2026" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="route_id">Ruta</Label>
              <select id="route_id" name="route_id" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">(Sin ruta)</option>
                {routes?.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <RouteQuickCreate />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="start_date">Fecha inicio</Label>
                <Input id="start_date" name="start_date" type="date" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="end_date">Fecha fin</Label>
                <Input id="end_date" name="end_date" type="date" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="capacity">Capacidad</Label>
                <Input id="capacity" name="capacity" type="number" min={1} placeholder="20" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="base_price_eur">Precio base por peregrino (EUR)</Label>
                <Input id="base_price_eur" name="base_price_eur" type="number" step="0.01" min={0} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="status">Estado</Label>
              <select id="status" name="status" defaultValue="planning" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {DEPARTURE_STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" rows={3} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" variant="accent">Crear camino</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
