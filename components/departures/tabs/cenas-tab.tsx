import { getMenusBoard } from "@/lib/actions/menus";
import { MenusBoard } from "@/components/departures/menus-board";

export async function CenasTab({ departureId }: { departureId: string }) {
  const { dinners, pilgrims } = await getMenusBoard(departureId);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Acá se eligen los menús de cada cena. Primero cargá el menú del restaurante con el botón{" "}
        <strong>Menú</strong> (o copiá el de la última vez), después cada peregrino elige desde su{" "}
        <strong>enlace personal</strong> y vos ves acá quién falta. Si alguien no cena una noche, marcalo con{" "}
        <strong>no cena</strong>. El Excel sale con una pestaña por restaurante, con la lista nominal y el conteo
        por plato.
      </p>
      <MenusBoard departureId={departureId} dinners={dinners} pilgrims={pilgrims} />
    </div>
  );
}
