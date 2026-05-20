"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ExpensesFilters({ departures }: { departures: any[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const kind = params.get("kind") ?? "";
  const departure_id = params.get("departure_id") ?? "";

  function setParam(name: string, value: string) {
    const s = new URLSearchParams(params.toString());
    if (value) s.set(name, value);
    else s.delete(name);
    router.push(`/gastos${s.toString() ? `?${s.toString()}` : ""}`);
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-muted-foreground">Filtros:</span>
      <Button size="sm" variant={kind === "" ? "default" : "outline"} onClick={() => setParam("kind", "")}>Todos</Button>
      <Button size="sm" variant={kind === "operativo" ? "default" : "outline"} onClick={() => setParam("kind", "operativo")}>Operativo</Button>
      <Button size="sm" variant={kind === "personal" ? "default" : "outline"} onClick={() => setParam("kind", "personal")}>Personal</Button>
      <select
        value={departure_id}
        onChange={(e) => setParam("departure_id", e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">(Todos los caminos)</option>
        {departures.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </div>
  );
}
