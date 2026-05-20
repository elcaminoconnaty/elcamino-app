import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PROVIDER_TYPES } from "@/lib/constants";
import { NewProviderDialog } from "@/components/providers/new-provider-dialog";

export const dynamic = "force-dynamic";

export default async function ProvidersListPage() {
  const supabase = createClient();
  const { data: providers } = await supabase.from("providers").select("*").order("name");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-camino-ink">Proveedores</h1>
          <p className="text-sm text-muted-foreground">{providers?.length ?? 0} en total</p>
          <div className="brand-yellow-bar mt-2" />
        </div>
        <NewProviderDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          {(!providers || providers.length === 0) ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No hay proveedores.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/proveedores/${p.id}`} className="hover:underline font-medium">{p.name}</Link>
                    </TableCell>
                    <TableCell>{PROVIDER_TYPES.find((t) => t.value === p.type)?.label ?? p.type}</TableCell>
                    <TableCell className="text-sm">{[p.city, p.country].filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell className="text-sm">
                      <div>{p.contact_name ?? "—"}</div>
                      <div className="text-muted-foreground">{p.email ?? p.phone ?? ""}</div>
                    </TableCell>
                    <TableCell>{p.active ? <Badge variant="success">Activo</Badge> : <Badge variant="muted">Inactivo</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
